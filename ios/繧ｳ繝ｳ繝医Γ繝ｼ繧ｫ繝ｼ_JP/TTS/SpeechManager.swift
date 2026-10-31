import Foundation
import AVFoundation
import Combine

/// ★ 本格コント対応：アクション種別（新タグにも完全対応）
enum ManzaiActionType: String {
    case openingGreet   // 開幕挨拶
    case normalTalk     // 通常会話（口パク＋自然な手振り）
    case bokeSilly      // おどけたボケ・爆笑・拍手（左右ステップ＆音符♪）
    case bokeActing     // モノマネ・芝居ボケ・振り返る（小道具を振り回す）
    case tsukkomiPoint  // 普通のツッコミ・指差し・怒る（1回パシッ！と叩く）
    case tsukkomiSlap   // 強ツッコミ（1回バシッ！と強く叩く＋相手が吹っ飛ぶ）
    case tsukkomiSigh   // 呆れツッコミ・無反応（うなだれ＋縦線ガーン|||）
    case questionTilt   // 疑問（首かしげ＋？）
    case finalBow       // お辞儀
    case zukoke         // ズッコケ（片足を高く上げて床にひっくり返る！）
    case dogeza         // ジャンピング土下座・ひざまずく（床に頭を擦り付けて謝罪！）
    case stepClose      // 詰め寄り・圧かけ（相手の目の前までグッと顔を近づける）
    case panicShake     // パニック・ガタガタ震え・逃げる・隠れる（顔面蒼白で高速振動＋汗💦）
    case astonished     // 驚愕・驚く・ジャンプ（大きく目を見開き、跳ねる）
    case working        // 作業（設備に近寄り、手を動かす）
    case poseCool       // キメポーズ・決めポーズ・ドヤ顔（シャキーン！とカッコつける）
}

/// 台本の読み上げとコント演出トリガーを管理する共通マネージャー
final class SpeechManager: NSObject, ObservableObject, AVSpeechSynthesizerDelegate {
    static let shared = SpeechManager()

    @Published var currentIndex: Int = -1
    @Published var currentLineText: String? = nil
    @Published var currentSpeakerIndex: Int = 0
    @Published var currentAction: ManzaiActionType = .normalTalk
    @Published var isSpeaking: Bool = false
    @Published var isActivelyVoicing: Bool = false

    struct TurnItem {
        let index: Int
        let speakerSide: Int          // 0: 左(ボケ役), 1: 右(ツッコミ役)
        let displayLine: String       // 話者名つき・タグ除去済みの表示行
        let cleanSubtitle: String     // 話者名＆タグ除去済みのセリフ本文
        let speakText: String         // TTS発音調整済みテキスト
        let action: ManzaiActionType
        let rateMultiplier: Float
        let pitchMultiplier: Float
        let volume: Float
        let preDelay: TimeInterval
    }

    private let synthesizer = AVSpeechSynthesizer()
    private(set) var turns: [TurnItem] = []

    private var voiceMode: VoiceMode = .male
    private var speed: Float = VoiceMode.male.defaultSpeed
    private var pitch: Float = VoiceMode.male.defaultPitch

    private var pausedIndex: Int?
    private var pendingWorkItem: DispatchWorkItem?
    private var activeUtterance: AVSpeechUtterance?

    /// ★ バックエンドの新旧すべての身体動作タグ＆視覚効果タグ（2連続タグにも対応）
    static let singleTagRegex = "[\\[【(（](?:驚愕|驚く|作業|逃げる|隠れる|叩く|強ツッコミ|ツッコミ|軽くツッコミ|指摘|指差し|怒る|ボケ|アホ|おどけ|爆笑|拍手|モノマネ|演技|振り返る|呆れ|ため息|無反応|疑問|お辞儀|通常|ズッコケ|土下座|謝罪|ひざまずく|詰め寄る|圧|パニック|震える|キメ|ポーズ|決めポーズ|ドヤ顔|ジャンプ|怒りマーク|集中線)[\\]】)）]\\s*"
    static let actionTagPattern = "(?:\(singleTagRegex))+"

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    // MARK: - 設定

    func configure(text: String, voiceMode: VoiceMode, speed: Float, pitch: Float, includeStageGreetings: Bool = false, castRoles: [String] = []) {
        self.voiceMode = voiceMode
        self.speed = speed
        self.pitch = pitch
        self.turns = Self.buildExpressiveTurns(from: text, includeStageGreetings: includeStageGreetings, castRoles: castRoles)
    }

    // MARK: - 再生制御

    func start() {
        guard !turns.isEmpty else { return }

        isSpeaking = false
        isActivelyVoicing = false
        cancelPendingSpeak()
        activeUtterance = nil
        stopAll()

        currentIndex = 0
        pausedIndex = nil
        isSpeaking = true
        speakCurrent(withDelay: false)
    }

    func stop() {
        isSpeaking = false
        isActivelyVoicing = false
        cancelPendingSpeak()
        activeUtterance = nil
        stopAll()
        currentIndex = -1
        currentLineText = nil
        currentAction = .normalTalk
        pausedIndex = nil
    }

    func pause() {
        guard isSpeaking else { return }
        if currentIndex >= 0 && currentIndex < turns.count {
            pausedIndex = currentIndex
        }
        isSpeaking = false
        isActivelyVoicing = false
        cancelPendingSpeak()
        activeUtterance = nil
        synthesizer.stopSpeaking(at: .immediate)
    }

    func resume() {
        guard !turns.isEmpty else { return }
        let idx = pausedIndex ?? (currentIndex >= 0 ? currentIndex : 0)
        guard idx >= 0, idx < turns.count else { return }

        currentIndex = idx
        isSpeaking = true
        speakCurrent(withDelay: false)
    }

    // MARK: - 内部処理

    private func cancelPendingSpeak() {
        pendingWorkItem?.cancel()
        pendingWorkItem = nil
    }

    private func stopAll() {
        synthesizer.stopSpeaking(at: .immediate)
    }

    private func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true)
        } catch {
            print("AudioSession error:", error)
        }
    }

    private func speakCurrent(withDelay: Bool) {
        guard isSpeaking, currentIndex >= 0, currentIndex < turns.count else { return }
        cancelPendingSpeak()

        let item = turns[currentIndex]
        let speedScale = Double(max(speed / 0.6, 0.65))
        let delay = withDelay ? (item.preDelay / speedScale) : 0.0

        // セリフ間の待機中は一旦両方とも口を閉じる
        isActivelyVoicing = false

        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.isSpeaking else { return }
            self.configureAudioSession()

            // ★ 発話サイド(0:左 / 1:右)をセットしてから発話を開始
            self.currentSpeakerIndex = item.speakerSide
            self.currentAction = item.action
            self.currentLineText = item.displayLine

            guard !item.speakText.isEmpty else {
                self.moveToNextLine()
                return
            }

            let leftV = self.selectVoice(for: 0)
            let rightV = self.selectVoice(for: 1)
            let sameVoiceIdentifier = (leftV?.identifier == rightV?.identifier)

            let utterance = AVSpeechUtterance(string: item.speakText)
            utterance.voice = (item.speakerSide == 0) ? leftV : rightV

            let speakerRateDiff: Float = (item.speakerSide == 0) ? 0.99 : 1.01
            let baseRate = self.speed * 0.90 * speakerRateDiff * item.rateMultiplier
            utterance.rate = min(max(baseRate, 0.35), 0.62)

            let sidePitchShift: Float
            if item.speakerSide == 0 {
                sidePitchShift = sameVoiceIdentifier ? 1.24 : 1.12
            } else {
                sidePitchShift = sameVoiceIdentifier ? 0.76 : 0.86
            }

            let modeBasePitch: Float = (self.voiceMode == .male) ? max(0.60, self.pitch - 0.08) : self.pitch
            let jitter = Float.random(in: 0.99...1.01)
            let finalPitch = modeBasePitch * sidePitchShift * item.pitchMultiplier * jitter
            utterance.pitchMultiplier = min(max(finalPitch, 0.5), 2.0)

            utterance.volume = item.volume

            self.activeUtterance = utterance
            self.isActivelyVoicing = true
            self.synthesizer.speak(utterance)
        }

        pendingWorkItem = work
        if delay > 0.01 {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private func selectVoice(for side: Int) -> AVSpeechSynthesisVoice? {
        let allVoices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.hasPrefix("ja") }
        let otoya = allVoices.first(where: { $0.name.contains("Otoya") || $0.identifier.lowercased().contains("otoya") })
        let kyoko = allVoices.first(where: { $0.name.contains("Kyoko") || $0.identifier.lowercased().contains("kyoko") })
        let others = allVoices.filter { $0.identifier != otoya?.identifier && $0.identifier != kyoko?.identifier }

        switch voiceMode {
        case .male:
            if side == 0 {
                return kyoko ?? others.first ?? otoya ?? AVSpeechSynthesisVoice(language: "ja-JP")
            } else {
                return otoya ?? others.last ?? kyoko ?? AVSpeechSynthesisVoice(language: "ja-JP")
            }
        case .female:
            if side == 0 {
                return kyoko ?? allVoices.first ?? AVSpeechSynthesisVoice(language: "ja-JP")
            } else {
                return others.first ?? otoya ?? kyoko ?? AVSpeechSynthesisVoice(language: "ja-JP")
            }
        case .alien:
            return AVSpeechSynthesisVoice(language: "en-US")
        }
    }

    private func moveToNextLine() {
        activeUtterance = nil
        isActivelyVoicing = false
        if currentIndex + 1 < turns.count {
            currentIndex += 1
            speakCurrent(withDelay: true)
        } else {
            isSpeaking = false
            currentLineText = nil
            currentIndex = -1
            currentAction = .normalTalk
            pausedIndex = nil
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didStart utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard self.isSpeaking, self.activeUtterance === utterance else { return }
            self.isActivelyVoicing = true
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard self.isSpeaking, self.activeUtterance === utterance else { return }
            self.moveToNextLine()
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer,
                           didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            guard self.activeUtterance === utterance else { return }
            self.isActivelyVoicing = false
        }
    }

    // MARK: - 演出タグ除去・コントアクション自動判定ユーティリティ

    static func stripActionTags(from text: String) -> String {
        let noTags = text.replacingOccurrences(of: actionTagPattern, with: "", options: .regularExpression)
        return noTags.components(separatedBy: .newlines)
            .filter { line in
                line.range(of: #"^\s*\[?(?:STAGE|LEFT_COSTUME|RIGHT_COSTUME|CAST_LEFT|CAST_RIGHT|LEFT_ROLE|RIGHT_ROLE)\s*[:：]"#, options: [.regularExpression, .caseInsensitive]) == nil
            }
            .joined(separator: "\n")
    }

    static func extractTagAndCleanLine(from line: String) -> (tagName: String?, cleanLine: String) {
        var detectedTags: [String] = []
        let tagCapturePattern = "[\\[【(（](驚愕|驚く|作業|逃げる|隠れる|叩く|強ツッコミ|ツッコミ|軽くツッコミ|指摘|指差し|怒る|ボケ|アホ|おどけ|爆笑|拍手|モノマネ|演技|振り返る|呆れ|ため息|無反応|疑問|お辞儀|通常|ズッコケ|土下座|謝罪|ひざまずく|詰め寄る|圧|パニック|震える|キメ|ポーズ|決めポーズ|ドヤ顔|ジャンプ|怒りマーク|集中線)[\\]】)）]"
        if let regex = try? NSRegularExpression(pattern: tagCapturePattern, options: []) {
            let matches = regex.matches(in: line, options: [], range: NSRange(line.startIndex..., in: line))
            for m in matches where m.numberOfRanges > 1 {
                if let r = Range(m.range(at: 1), in: line) {
                    detectedTags.append(String(line[r]))
                }
            }
        }
        // 視覚効果タグ（怒りマーク・集中線）以外の身体動作タグを優先取得
        let primaryTag = detectedTags.first(where: { $0 != "怒りマーク" && $0 != "集中線" }) ?? detectedTags.first

        let cleaned = stripActionTags(from: line)
            .replacingOccurrences(of: "[（(][^）)]*[）)]", with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return (primaryTag, cleaned)
    }

    static func stripSpeakerName(from line: String) -> String {
        let withoutTags = stripActionTags(from: line)
        if let idx = withoutTags.firstIndex(where: { ":" == $0 || "：" == $0 }) {
            let after = withoutTags.index(after: idx)
            return String(withoutTags[after...]).trimmingCharacters(in: .whitespaces)
        }
        return withoutTags.trimmingCharacters(in: .whitespaces)
    }

    static func splitIntoSentences(text: String) -> [String] {
        text.components(separatedBy: .newlines)
            .map { stripActionTags(from: $0).trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    static func extractScriptSpeakerNames(from rawScript: String) -> [String] {
        let rawLines = rawScript.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var speakers: [String] = []
        for rawLine in rawLines {
            if rawLine.range(of: #"^(STAGE|LEFT_COSTUME|RIGHT_COSTUME|CAST_LEFT|CAST_RIGHT|LEFT_ROLE|RIGHT_ROLE|タイトル)\s*[:：]"#, options: [.regularExpression, .caseInsensitive]) != nil { continue }
            let (_, cleanLine) = extractTagAndCleanLine(from: rawLine)
            guard let colonIdx = cleanLine.firstIndex(where: { $0 == ":" || $0 == "：" }) else { continue }
            let candidate = String(cleanLine[..<colonIdx]).trimmingCharacters(in: .whitespaces)
            guard !candidate.isEmpty, candidate.count <= 50,
                  candidate.range(of: #"^\d+$"#, options: .regularExpression) == nil else { continue }
            if !speakers.contains(candidate) {
                speakers.append(candidate)
            }
        }
        return speakers
    }

    private static func singleLineKeywordScore(speech: String, expectedCostume: ConteRoleCostume?) -> Int {
        guard let costume = expectedCostume else { return 0 }
        let keywords: [String]
        switch costume {
        case .ANIMAL_PANDA:
            keywords = ["笹", "竹", "白黒", "パンダ", "上野", "和歌山", "タイヤ", "転が", "人気者"]
        case .ANIMAL_CAT:
            keywords = ["ニャ", "にゃ", "猫", "ネコ", "ちゅーる", "チュール", "マタタビ", "またたび", "毛玉", "こたつ", "爪とぎ", "ネズミ", "キャット", "ボス猫"]
        case .ANIMAL_DOG:
            keywords = ["ワン", "わん", "犬", "柴犬", "番犬", "散歩", "リード", "お手", "お座り", "骨", "ドッグ", "飼い主"]
        case .ANIMAL_GORILLA:
            keywords = ["ウホ", "ドラミング", "ゴリラ", "バナナ", "ジャングル", "握力", "霊長類"]
        case .ANIMAL_BEAR:
            keywords = ["冬眠", "ハチミツ", "鮭", "シャケ", "クマ", "熊", "森", "木彫り"]
        case .ANIMAL_RABBIT:
            keywords = ["ピョン", "ぴょん", "ウサギ", "うさぎ", "ニンジン", "人参", "耳が長", "寂しいと"]
        case .ANIMAL_BIRD_PENGUIN:
            keywords = ["南極", "氷", "ペンギン", "飛べない", "泳ぐ", "皇帝", "ファーストペンギン"]
        case .ANIMAL_OCTOPUS:
            keywords = ["墨", "吸盤", "8本", "八本", "タコ", "たこ焼き", "海底"]
        case .ANIMAL_ALIEN:
            keywords = ["地球", "UFO", "宇宙", "母星", "侵略", "ワレワレ", "銀河"]
        case .OBJECT_FRIDGE:
            keywords = ["冷やす", "冷凍", "野菜室", "庫内", "賞味期限", "ドアを開け", "氷"]
        case .OBJECT_SMARTPHONE:
            keywords = ["充電", "バッテリー", "通知", "アプリ", "検索", "画面", "Wi-Fi", "ギガ"]
        case .OBJECT_APPLE:
            keywords = ["果汁", "蜜", "青森", "皮をむ", "赤い", "アップル"]
        case .OBJECT_ONIGIRI:
            keywords = ["海苔", "具", "梅", "ツナマヨ", "鮭", "米", "握", "コンビニの棚"]
        case .OBJECT_TRAFFIC_LIGHT:
            keywords = ["赤", "青", "黄色", "交差点", "止まれ", "渡れ", "点滅"]
        case .OBJECT_SWORD:
            keywords = ["抜くな", "勇者", "鞘", "刃", "斬", "伝説の", "封印"]
        case .OBJECT_TOILET:
            keywords = ["流す", "レバー", "便座", "ウォシュレット", "紙", "個室"]
        case .OBJECT_ROBOT:
            keywords = ["AI", "プログラム", "計算", "エラー", "機能", "バッテリー", "ロボット"]
        default:
            keywords = []
        }
        var score = 0
        for kw in keywords where speech.contains(kw) {
            score += 40
        }
        return score
    }

    static func buildExpressiveTurns(from rawScript: String, includeStageGreetings: Bool = false, castRoles: [String] = []) -> [TurnItem] {
        let rawLines = rawScript.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }

        struct ParsedTurn {
            var side: Int
            var speakerName: String
            var speechBody: String
            var tagName: String?
        }

        func normalizedName(_ value: String) -> String {
            value.trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: #"^(?:左(?:側|役)?|右(?:側|役)?|ボケ役?|ツッコミ役?)\s*[:：]\s*"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"[（(].*?[）)]"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: #"[\s 「」『』]"#, with: "", options: .regularExpression)
                .replacingOccurrences(of: "スマートフォン", with: "スマホ")
                .replacingOccurrences(of: "イヌ", with: "犬")
                .replacingOccurrences(of: "ネコ", with: "猫")
                .replacingOccurrences(of: "うさぎ", with: "ウサギ")
        }

        let cast = Array(castRoles.prefix(2)).map(normalizedName)
        let leftExpectedCostume: ConteRoleCostume? = cast.indices.contains(0) ? ConteRoleCostume.inferred(from: cast[0]) : nil
        let rightExpectedCostume: ConteRoleCostume? = cast.indices.contains(1) ? ConteRoleCostume.inferred(from: cast[1]) : nil
        let leftHumanCostume: ConteRoleCostume? = cast.indices.contains(0) ? ConteRoleCostume.inferredHumanCostume(from: cast[0]) : nil
        let rightHumanCostume: ConteRoleCostume? = cast.indices.contains(1) ? ConteRoleCostume.inferredHumanCostume(from: cast[1]) : nil

        func directLineSide(speaker: String, speech: String, tag: String?) -> Int? {
            let trimmed = speaker.trimmingCharacters(in: .whitespacesAndNewlines)
            let norm = normalizedName(trimmed)

            if ["A", "①", "1", "一人目", "ボケ", "ボケ役", "左", "左側", "左役"].contains(norm) { return 0 }
            if ["B", "②", "2", "二人目", "ツッコミ", "ツッコミ役", "右", "右側", "右役"].contains(norm) { return 1 }
            if trimmed.hasPrefix("左:") || trimmed.hasPrefix("左：") || trimmed.hasPrefix("ボケ:") || trimmed.hasPrefix("ボケ：") { return 0 }
            if trimmed.hasPrefix("右:") || trimmed.hasPrefix("右：") || trimmed.hasPrefix("ツッコミ:") || trimmed.hasPrefix("ツッコミ：") { return 1 }

            guard cast.count == 2 else { return nil }

            if !norm.isEmpty {
                if norm == cast[0] && norm != cast[1] { return 0 }
                if norm == cast[1] && norm != cast[0] { return 1 }
            }

            if let spkNonhuman = ConteRoleCostume.inferred(from: norm) {
                if spkNonhuman == leftExpectedCostume && spkNonhuman != rightExpectedCostume { return 0 }
                if spkNonhuman == rightExpectedCostume && spkNonhuman != leftExpectedCostume { return 1 }
            }

            if let spkHuman = ConteRoleCostume.inferredHumanCostume(from: norm), spkHuman != .CASUAL_PLAIN {
                if spkHuman == leftHumanCostume && spkHuman != rightHumanCostume { return 0 }
                if spkHuman == rightHumanCostume && spkHuman != leftHumanCostume { return 1 }
            }

            if norm.count >= 2 {
                let inLeft = cast[0].contains(norm) || norm.contains(cast[0])
                let inRight = cast[1].contains(norm) || norm.contains(cast[1])
                if inLeft && !inRight { return 0 }
                if inRight && !inLeft { return 1 }
            }

            let kwLeft = singleLineKeywordScore(speech: speech, expectedCostume: leftExpectedCostume)
            let kwRight = singleLineKeywordScore(speech: speech, expectedCostume: rightExpectedCostume)
            if kwLeft > kwRight { return 0 }
            if kwRight > kwLeft { return 1 }

            return nil
        }

        var parsed: [ParsedTurn] = []
        for rawLine in rawLines {
            if rawLine.range(of: #"^(STAGE|LEFT_COSTUME|RIGHT_COSTUME|CAST_LEFT|CAST_RIGHT|LEFT_ROLE|RIGHT_ROLE|タイトル)\s*[:：]"#, options: [.regularExpression, .caseInsensitive]) != nil { continue }
            let (tagName, cleanLine) = extractTagAndCleanLine(from: rawLine)
            guard !cleanLine.isEmpty else { continue }

            var speakerName: String? = nil
            var speechBody = cleanLine
            if let colonIdx = cleanLine.firstIndex(where: { $0 == ":" || $0 == "：" }) {
                let candidateName = String(cleanLine[..<colonIdx]).trimmingCharacters(in: .whitespaces)
                if !candidateName.isEmpty && candidateName.count <= 50 &&
                   candidateName.range(of: #"^\d+$"#, options: .regularExpression) == nil {
                    speakerName = candidateName
                    let after = cleanLine.index(after: colonIdx)
                    speechBody = String(cleanLine[after...]).trimmingCharacters(in: .whitespaces)
                }
            }
            guard !speechBody.isEmpty else { continue }
            if let speakerName {
                parsed.append(ParsedTurn(side: -1, speakerName: speakerName, speechBody: speechBody, tagName: tagName))
            } else if !parsed.isEmpty {
                parsed[parsed.count - 1].speechBody += " " + speechBody
            } else {
                parsed.append(ParsedTurn(side: -1, speakerName: "", speechBody: speechBody, tagName: tagName))
            }
        }

        guard !parsed.isEmpty else { return [] }

        var nameToSide: [String: Int] = [:]
        for i in parsed.indices {
            let key = normalizedName(parsed[i].speakerName)
            if let direct = directLineSide(speaker: parsed[i].speakerName, speech: parsed[i].speechBody, tag: parsed[i].tagName) {
                parsed[i].side = direct
                if !key.isEmpty && nameToSide[key] == nil {
                    nameToSide[key] = direct
                }
            }
        }

        let uniqueSpeakers: [String] = parsed.reduce(into: []) { names, turn in
            let name = normalizedName(turn.speakerName)
            if !name.isEmpty && !names.contains(name) { names.append(name) }
        }
        if uniqueSpeakers.count == 2 {
            let k0 = uniqueSpeakers[0]
            let k1 = uniqueSpeakers[1]
            if let s0 = nameToSide[k0], nameToSide[k1] == nil {
                nameToSide[k1] = 1 - s0
            } else if let s1 = nameToSide[k1], nameToSide[k0] == nil {
                nameToSide[k0] = 1 - s1
            } else if let s0 = nameToSide[k0], let s1 = nameToSide[k1], s0 == s1 {
                let tsukkomiTags: Set<String> = ["ツッコミ", "強ツッコミ", "叩く", "呆れ", "指摘", "指差し", "怒る", "ズッコケ"]
                let t0 = parsed.filter { normalizedName($0.speakerName) == k0 && tsukkomiTags.contains($0.tagName ?? "") }.count
                let t1 = parsed.filter { normalizedName($0.speakerName) == k1 && tsukkomiTags.contains($0.tagName ?? "") }.count
                if t0 > t1 {
                    nameToSide[k0] = 1
                    nameToSide[k1] = 0
                } else {
                    nameToSide[k0] = 0
                    nameToSide[k1] = 1
                }
            }
        }

        for i in parsed.indices {
            let key = normalizedName(parsed[i].speakerName)
            if let mapped = nameToSide[key] {
                parsed[i].side = mapped
            } else if parsed[i].side == -1 {
                if i == 0 {
                    if parsed.count >= 2 {
                        let nextKey = normalizedName(parsed[1].speakerName)
                        if let nextSide = nameToSide[nextKey] ?? (parsed[1].side != -1 ? parsed[1].side : nil) {
                            parsed[0].side = 1 - nextSide
                        } else {
                            parsed[0].side = 0
                        }
                    } else {
                        parsed[0].side = 0
                    }
                } else {
                    parsed[i].side = 1 - parsed[i - 1].side
                }
                if !key.isEmpty {
                    nameToSide[key] = parsed[i].side
                }
            }
        }

        if parsed.count >= 2 && Set(parsed.map(\.side)).count == 1 {
            let tsukkomiTags: Set<String> = ["ツッコミ", "強ツッコミ", "叩く", "呆れ", "指摘", "指差し", "怒る", "ズッコケ"]
            let startSide = tsukkomiTags.contains(parsed[0].tagName ?? "") ? 1 : 0
            for i in parsed.indices {
                parsed[i].side = (startSide + i) % 2
            }
        }

        for i in parsed.indices {
            if parsed[i].speakerName.isEmpty {
                let side = parsed[i].side
                parsed[i].speakerName = (castRoles.count == 2 && !castRoles[side].isEmpty)
                    ? castRoles[side]
                    : (side == 0 ? "A" : "B")
            }
        }

        let endingPattern = "(もうええわ|もういいよ|いい加減にしろ)"
        let onlyEndingLinePattern = "^(いや、?|おい、?)?(もうええわ|もういいよ|いい加減にしろ)[！!ー〜。\\s]*$"

        while parsed.count >= 2 {
            let lastBody = parsed[parsed.count - 1].speechBody
            let prevBody = parsed[parsed.count - 2].speechBody
            if lastBody.range(of: onlyEndingLinePattern, options: .regularExpression) != nil &&
               (prevBody.range(of: endingPattern, options: .regularExpression) != nil || !includeStageGreetings) {
                parsed.removeLast()
            } else {
                break
            }
        }
        if !parsed.isEmpty {
            let lastIdx = parsed.count - 1
            parsed[lastIdx].speechBody = parsed[lastIdx].speechBody.replacingOccurrences(
                of: "(もうええわ|もういいよ|いい加減にしろ)[！!。\\s]*(もうええわ|もういいよ)[！!。\\s]*$",
                with: "$1！",
                options: .regularExpression
            )
        }

        var lastSlapIdx = -10
        var totalSlapCount = 0
        var items: [TurnItem] = []
        var prevSpeech: String? = nil

        for (idx, p) in parsed.enumerated() {
            let isFirst = (idx == 0)
            let isNearEnd = (idx >= parsed.count - 2)

            let preDelay = calculatePause(prev: prevSpeech, current: p.speechBody, side: p.side, isFirst: isFirst, isNearEnd: isNearEnd)

            let (action, rateMult, pitchMult, vol) = resolveProsodyAndAction(
                speech: p.speechBody,
                side: p.side,
                tagName: p.tagName,
                isFirst: isFirst,
                isNearEnd: isNearEnd,
                turnIndex: idx,
                totalTurns: parsed.count,
                lastSlapIndex: &lastSlapIdx,
                totalSlapCount: &totalSlapCount
            )

            let tunedSpeak = tuneForTts(p.speechBody, action: action)
            let displayLine = "\(p.speakerName): \(p.speechBody)"

            items.append(
                TurnItem(
                    index: items.count,
                    speakerSide: p.side,
                    displayLine: displayLine,
                    cleanSubtitle: p.speechBody,
                    speakText: tunedSpeak,
                    action: action,
                    rateMultiplier: rateMult,
                    pitchMultiplier: pitchMult,
                    volume: vol,
                    preDelay: preDelay
                )
            )
            prevSpeech = p.speechBody
        }

        return items
    }

    private static func calculatePause(prev: String?, current: String, side: Int, isFirst: Bool, isNearEnd: Bool) -> TimeInterval {
        if isFirst || prev == nil { return 0.08 }

        if isNearEnd && current.range(of: "(もういいよ|もうええわ|いい加減にしろ)", options: .regularExpression) != nil {
            return 0.42
        }
        if current.hasPrefix("…") || current.hasPrefix("いや…") || current.hasPrefix("あのさ") || current.hasPrefix("はぁ") {
            return 0.48
        }
        if let p = prev, (p.hasSuffix("…") || p.hasSuffix("知らんけど。") || p.hasSuffix("知らんけど")) {
            return 0.40
        }

        if side == 1 {
            if current.count <= 16 && (current.contains("！") || current.contains("!") || current.contains("？")) {
                return 0.05
            }
            if current.range(of: "^(なんでやねん|おい|いや|ちょっと待て|待て待て|お前|誰が|やかましい|ちゃうわ|違うわ|なんでや|えっ)", options: .regularExpression) != nil {
                return 0.07
            }
        }

        if let p = prev, p.hasSuffix("？") { return 0.20 }
        if let p = prev, p.count >= 45 { return 0.28 }
        return 0.16
    }

    private static func resolveProsodyAndAction(
        speech: String,
        side: Int,
        tagName: String?,
        isFirst: Bool,
        isNearEnd: Bool,
        turnIndex: Int,
        totalTurns: Int,
        lastSlapIndex: inout Int,
        totalSlapCount: inout Int
    ) -> (ManzaiActionType, Float, Float, Float) {

        if tagName == "驚愕" || tagName == "驚く" || tagName == "ジャンプ" { return (.astonished, 1.08, 1.23, 1.0) }
        if tagName == "作業" { return (.working, 0.98, 0.98, 0.96) }

        if tagName == "土下座" || tagName == "謝罪" || tagName == "ひざまずく" ||
           speech.range(of: "(土下座|許して|ごめんなさい|すいませんでした|すみませんでした|どうかお願い|命だけは|堪忍して)", options: .regularExpression) != nil {
            return (.dogeza, 1.04, 1.12, 1.0)
        }

        if tagName == "パニック" || tagName == "震える" || tagName == "逃げる" || tagName == "隠れる" ||
           speech.range(of: "(ひぃぃ|ヒィィ|うわああ|ぎゃああ|ガタガタ|ブルブル|ヤバいヤバい|怖い怖い|助けてくれ|震えが)", options: .regularExpression) != nil {
            return (.panicShake, 1.06, 1.15, 0.98)
        }

        if tagName == "ズッコケ" ||
           (side == 1 && speech.range(of: "(ズコー|ずこー|コケる|なんでやねんそれ|ズッコケ|ガクッ|だめだこりゃ)", options: .regularExpression) != nil) {
            return (.zukoke, 1.05, 1.08, 1.0)
        }

        if tagName == "詰め寄る" || tagName == "圧" ||
           speech.range(of: "(おいコラ|吐けよ|白状しろ|本当のことを言え|目を見ろ|逃がさんぞ|覚悟しろ|ちょっと表出ろ)", options: .regularExpression) != nil {
            return (.stepClose, 0.96, 0.88, 1.0)
        }

        if tagName == "キメ" || tagName == "ポーズ" || tagName == "決めポーズ" || tagName == "ドヤ顔" ||
           (side == 0 && speech.range(of: "(フッ…|ふっ…|実は俺|何を隠そう|プロですから|伝説の|選ばれし|シャキーン|ドヤ)", options: .regularExpression) != nil) {
            return (.poseCool, 0.97, 0.92, 1.0)
        }

        let killerRegex = "(なんでやねん|やかましいわ|誰が興味あんねん|しばくぞ|アホか|バカか|いい加減にしろ|もうええわ|もういいよ|帰れや|警察呼ぶぞ)"
        let generalTsukkomiRegex = "(なんでやねん|おかしいやろ|ちゃうわ|違うわ|誰が|やかましい|やめろ|待てや|しろや|やろがい|なんでや|おい|こら|ちょっと待て|待て待て|どうなってんねん|どんなやねん|なんでだよ|ふざけんな)"

        let isEndingPhrase = speech.range(of: "(もうええわ|もういいよ|いい加減にしろ)", options: .regularExpression) != nil
        let canSlap = (turnIndex - lastSlapIndex >= 3 && totalSlapCount < 3 && turnIndex >= totalTurns / 3) ||
                      isEndingPhrase ||
                      (tagName == "叩く" || tagName == "強ツッコミ")

        let isKillerCandidate = (side == 1) && (speech.range(of: killerRegex, options: .regularExpression) != nil || tagName == "叩く" || tagName == "強ツッコミ")

        if isKillerCandidate && canSlap {
            lastSlapIndex = turnIndex
            if !isEndingPhrase { totalSlapCount += 1 }
            return (.tsukkomiSlap, 1.06, 1.10, 1.0)
        }

        if let tag = tagName {
            switch tag {
            case "叩く", "強ツッコミ", "ツッコミ", "軽くツッコミ", "指摘", "指差し", "怒る":
                return (.tsukkomiPoint, 1.05, 1.06, 0.98)
            case "ボケ", "アホ", "おどけ", "爆笑", "拍手":
                return (.bokeSilly, 1.00, 1.06, 0.96)
            case "モノマネ", "演技", "振り返る":
                return (.bokeActing, 1.00, 1.10, 0.98)
            case "呆れ", "ため息", "無反応":
                if tag != "無反応" && turnIndex >= 4 && turnIndex % 5 == 0 {
                    return (.zukoke, 1.02, 1.04, 0.96)
                }
                return (.tsukkomiSigh, 0.95, 0.90, 0.88)
            case "疑問":
                return (.questionTilt, 1.02, 1.08, 0.95)
            default:
                break
            }
        }

        if side == 1 && (speech.range(of: generalTsukkomiRegex, options: .regularExpression) != nil || (speech.count <= 22 && speech.hasSuffix("！"))) {
            return (.tsukkomiPoint, 1.05, 1.06, 0.98)
        }
        if speech.range(of: "「[^」]+」", options: .regularExpression) != nil {
            return (.bokeActing, 1.00, 1.10, 0.98)
        }
        if speech.range(of: "^(いや、|いやいや、|あのさ|あのね|はぁ|やれやれ|ていうか|というか|まあ)", options: .regularExpression) != nil || speech.hasSuffix("…") {
            return (.tsukkomiSigh, 0.95, 0.90, 0.88)
        }
        if speech.hasSuffix("？") || speech.hasSuffix("?") {
            return (.questionTilt, 1.02, 1.08, 0.95)
        }
        if side == 0 && (speech.range(of: "(知らんけど|たぶん|ちゃうかな|かもしれん|やろな|やで〜|えへへ|てへ|ピョーン|ドーン|バーン)", options: .regularExpression) != nil || speech.hasSuffix("♪") || speech.hasSuffix("〜")) {
            return (.bokeSilly, 1.00, 1.06, 0.96)
        }

        return (.normalTalk, 1.00, 1.00, 0.94)
    }

    private static func tuneForTts(_ text: String, action: ManzaiActionType) -> String {
        var t = text
            .replacingOccurrences(of: "^[…・.]+", with: "", options: .regularExpression)
            .replacingOccurrences(of: "[！!]+", with: "！", options: .regularExpression)
            .replacingOccurrences(of: "[？?]+", with: "？", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if action == .tsukkomiSlap || action == .tsukkomiPoint {
            if !t.hasSuffix("！") && !t.hasSuffix("？") {
                t += "！"
            }
            t = t.replacingOccurrences(of: "なんでやねん", with: "なんでやねんっ")
                .replacingOccurrences(of: "もうええわ", with: "もう、ええわっ")
                .replacingOccurrences(of: "もういいよ", with: "もう、いいよっ")
        }
        return t.isEmpty ? text : t
    }
}
