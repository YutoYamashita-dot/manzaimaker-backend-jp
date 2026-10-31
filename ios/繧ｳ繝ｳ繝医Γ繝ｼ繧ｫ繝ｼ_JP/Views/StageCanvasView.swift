import SwiftUI

/// ★ コントの舞台セット＆衣装・小道具スタイル
enum ContePropStyle {
    case shopCounter      // 🏪 コンビニ・スーパー
    case interrogation    // 🚓 警察・取調室
    case hospital         // 🏥 病院・手術室
    case classroom        // 🏫 学校・教室
    case cafeTable        // ☕ カフェ・レストラン
    case officeDesk       // 🏢 会社・面接
    case bankRobbery      // 💰 銀行強盗・事件
    case fantasyHero      // ⚔️ 勇者・時代劇・魔王
    case taxiCar          // 🚕 タクシー・車内
    case homeLiving       // 🏠 自宅・お茶の間・家族
    case hairSalon, gymRing, tvStudio, trainStation

    static func detect(from text: String) -> ContePropStyle {
        if let range = text.range(of: #"STAGE\s*:\s*([A-Z_]+)"#, options: .regularExpression) {
            let tag = String(text[range]).components(separatedBy: ":").last?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            switch tag {
            case "SHOP_COUNTER": return .shopCounter
            case "INTERROGATION": return .interrogation
            case "HOSPITAL": return .hospital
            case "CLASSROOM": return .classroom
            case "CAFE_TABLE": return .cafeTable
            case "OFFICE_DESK": return .officeDesk
            case "BANK_ROBBERY": return .bankRobbery
            case "FANTASY_HERO": return .fantasyHero
            case "TAXI_CAR": return .taxiCar
            case "HOME_LIVING": return .homeLiving
            case "HAIR_SALON": return .hairSalon
            case "GYM_RING": return .gymRing
            case "TV_STUDIO": return .tvStudio
            case "TRAIN_STATION": return .trainStation
            case "NONE": return .homeLiving
            default: break
            }
        }

        if text.range(of: "(強盗|銀行|人質|ピストル|拳銃|泥棒|空き巣|怪盗|金庫)", options: .regularExpression) != nil {
            return .bankRobbery
        }
        if text.range(of: "(勇者|魔王|剣|魔法|ファンタジー|異世界|城|ドラゴン|侍|忍者|将軍|殿様|時代劇)", options: .regularExpression) != nil {
            return .fantasyHero
        }
        if text.range(of: "(タクシー|運転手|ドライブ|車内|バス|教習所|カーナビ)", options: .regularExpression) != nil {
            return .taxiCar
        }
        if text.range(of: "(取調|警察|刑事|犯人|容疑者|逮捕|交番|自白|事件|探偵)", options: .regularExpression) != nil {
            return .interrogation
        }
        if text.range(of: "(病院|医者|医師|患者|診察|手術|ナース|看護師|救急|薬局|歯医者)", options: .regularExpression) != nil {
            return .hospital
        }
        if text.range(of: "(コンビニ|スーパー|レジ|店|ショップ|受付|ホテル|窓口|バイト|店員)", options: .regularExpression) != nil {
            return .shopCounter
        }
        if text.range(of: "(学校|教室|授業|先生|生徒|高校|中学|学園|テスト|職員室|部活)", options: .regularExpression) != nil {
            return .classroom
        }
        if text.range(of: "(カフェ|喫茶|ファミレス|レストラン|居酒屋|デート|バー|ランチ|食事|ウェイター|寿司|ラーメン)", options: .regularExpression) != nil {
            return .cafeTable
        }
        if text.range(of: "(会社|オフィス|面接|社長|上司|部下|会議|営業|就活|取引先)", options: .regularExpression) != nil {
            return .officeDesk
        }
        if text.range(of: "(美容室|美容院|ヘアサロン|理容室|散髪)", options: .regularExpression) != nil { return .hairSalon }
        if text.range(of: "(ジム|筋トレ|スポーツ|リング|格闘|トレーナー)", options: .regularExpression) != nil { return .gymRing }
        if text.range(of: "(テレビ|スタジオ|司会|番組|収録|生放送)", options: .regularExpression) != nil { return .tvStudio }
        if text.range(of: "(駅|ホーム|改札|電車|車掌|駅員)", options: .regularExpression) != nil { return .trainStation }
        return .homeLiving
    }
}

/// 役柄の衣装コード管理
enum ConteRoleCostume: String {
    case CLERK_APRON, SHOPPER_BAG, POLICE_DETECTIVE, SUSPECT_GLASSES
    case DOCTOR_COAT, PATIENT_BANDAGE, TEACHER_POINTER, STUDENT_CAP
    case WAITER_TRAY, CAFE_GUEST_MENU, BOSS_RED_TIE, APPLICANT_BLUE_TIE
    case ROBBER_MASK, HERO_SWORD, DEMON_MAGE_STAFF, DRIVER_CAP, CHEF_HAT
    case BARBER_SCISSORS, ATHLETE_HEADBAND, MC_MIC, STATION_STAFF, CASUAL_PLAIN
    case ANIMAL_DOG, ANIMAL_CAT, ANIMAL_PANDA, ANIMAL_GORILLA, ANIMAL_BEAR
    case ANIMAL_RABBIT, ANIMAL_BIRD_PENGUIN, ANIMAL_OCTOPUS, ANIMAL_ALIEN
    case OBJECT_FRIDGE, OBJECT_SMARTPHONE, OBJECT_APPLE, OBJECT_ONIGIRI
    case OBJECT_TRAFFIC_LIGHT, OBJECT_SWORD, OBJECT_TOILET, OBJECT_ROBOT

    var isCreature: Bool { rawValue.hasPrefix("ANIMAL_") }
    var isObject: Bool { rawValue.hasPrefix("OBJECT_") }

    /// 動物・物の姿を配役文字列から復元する
    static func inferred(from role: String) -> ConteRoleCostume? {
        let roleName = role.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^(左|右|ボケ役?|ツッコミ役?)\s*[:：]\s*"#, with: "", options: .regularExpression)

        let nonhumanTerms: [(String, ConteRoleCostume)] = [
            ("柴犬", .ANIMAL_DOG), ("番犬", .ANIMAL_DOG), ("犬", .ANIMAL_DOG), ("イヌ", .ANIMAL_DOG), ("狼", .ANIMAL_DOG),
            ("猫", .ANIMAL_CAT), ("ネコ", .ANIMAL_CAT), ("ニャンコ", .ANIMAL_CAT), ("ライオン", .ANIMAL_CAT), ("虎", .ANIMAL_CAT),
            ("パンダ", .ANIMAL_PANDA), ("ゴリラ", .ANIMAL_GORILLA), ("チンパンジー", .ANIMAL_GORILLA), ("猿", .ANIMAL_GORILLA),
            ("クマ", .ANIMAL_BEAR), ("熊", .ANIMAL_BEAR), ("ヒグマ", .ANIMAL_BEAR),
            ("ウサギ", .ANIMAL_RABBIT), ("うさぎ", .ANIMAL_RABBIT), ("兎", .ANIMAL_RABBIT),
            ("ペンギン", .ANIMAL_BIRD_PENGUIN), ("タコ", .ANIMAL_OCTOPUS), ("イカ", .ANIMAL_OCTOPUS),
            ("宇宙人", .ANIMAL_ALIEN), ("エイリアン", .ANIMAL_ALIEN),
            ("冷蔵庫", .OBJECT_FRIDGE), ("スマートフォン", .OBJECT_SMARTPHONE), ("スマホ", .OBJECT_SMARTPHONE),
            ("りんご", .OBJECT_APPLE), ("リンゴ", .OBJECT_APPLE), ("おにぎり", .OBJECT_ONIGIRI),
            ("信号機", .OBJECT_TRAFFIC_LIGHT), ("聖剣", .OBJECT_SWORD), ("魔剣", .OBJECT_SWORD),
            ("トイレ", .OBJECT_TOILET), ("便器", .OBJECT_TOILET), ("ロボット", .OBJECT_ROBOT)
        ]
        let humanTerms = ["店員", "バイト", "店長", "客", "お客", "飼育員", "飼育担当", "飼い主", "美容師", "理容師", "医者", "医師", "看護師", "患者", "先生", "教師", "担任", "生徒", "学生", "刑事", "警官", "警察", "容疑者", "犯人", "強盗", "上司", "部下", "社長", "運転手", "ドライバー", "司会", "人間", "スタッフ", "社員", "係員", "応募者", "面接官", "世話係"]

        func lastPosition(of keyword: String) -> Int? {
            guard let range = roleName.range(of: keyword, options: .backwards) else { return nil }
            return roleName.distance(from: roleName.startIndex, to: range.lowerBound)
        }
        var best: ConteRoleCostume?
        var bestPosition = -1
        for (keyword, costume) in nonhumanTerms {
            guard let range = roleName.range(of: keyword, options: .backwards) else { continue }
            let suffix = roleName[range.upperBound...]
            if ["好き", "派", "カフェ", "の飼い主", "を飼う", "のファン", "担当", "係"].contains(where: { suffix.hasPrefix($0) }) { continue }
            let pos = roleName.distance(from: roleName.startIndex, to: range.lowerBound)
            if pos >= bestPosition { bestPosition = pos; best = costume }
        }
        let latestHuman = humanTerms.compactMap(lastPosition).max() ?? -1
        if latestHuman > bestPosition { return nil }
        return best
    }

    /// ★ 人間役の職業コスチュームを配役文字列から復元する（SpeechManager / MainView / ManzaiPerformanceDialogView で使用）
    static func inferredHumanCostume(from role: String) -> ConteRoleCostume? {
        if inferred(from: role) != nil { return nil }
        let roleName = role.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^(左|右|ボケ役?|ツッコミ役?)\s*[:：]\s*"#, with: "", options: .regularExpression)

        let humanMap: [(String, ConteRoleCostume)] = [
            ("美容師", .BARBER_SCISSORS), ("理容師", .BARBER_SCISSORS),
            ("銀行強盗", .ROBBER_MASK), ("強盗", .ROBBER_MASK), ("泥棒", .ROBBER_MASK), ("怪盗", .ROBBER_MASK),
            ("刑事", .POLICE_DETECTIVE), ("警察", .POLICE_DETECTIVE), ("警官", .POLICE_DETECTIVE),
            ("容疑者", .SUSPECT_GLASSES), ("犯人", .SUSPECT_GLASSES),
            ("医者", .DOCTOR_COAT), ("医師", .DOCTOR_COAT), ("執刀医", .DOCTOR_COAT), ("院長", .DOCTOR_COAT), ("看護師", .DOCTOR_COAT),
            ("患者", .PATIENT_BANDAGE),
            ("先生", .TEACHER_POINTER), ("教師", .TEACHER_POINTER), ("担任", .TEACHER_POINTER),
            ("生徒", .STUDENT_CAP), ("学生", .STUDENT_CAP),
            ("ウェイター", .WAITER_TRAY),
            ("シェフ", .CHEF_HAT), ("大将", .CHEF_HAT),
            ("面接官", .BOSS_RED_TIE), ("社長", .BOSS_RED_TIE), ("上司", .BOSS_RED_TIE), ("部長", .BOSS_RED_TIE),
            ("応募者", .APPLICANT_BLUE_TIE), ("就活生", .APPLICANT_BLUE_TIE), ("部下", .APPLICANT_BLUE_TIE), ("新入社員", .APPLICANT_BLUE_TIE),
            ("勇者", .HERO_SWORD), ("騎士", .HERO_SWORD),
            ("魔王", .DEMON_MAGE_STAFF), ("魔法使い", .DEMON_MAGE_STAFF),
            ("運転手", .DRIVER_CAP), ("ドライバー", .DRIVER_CAP),
            ("トレーナー", .ATHLETE_HEADBAND), ("格闘家", .ATHLETE_HEADBAND),
            ("司会", .MC_MIC), ("アナウンサー", .MC_MIC),
            ("駅員", .STATION_STAFF), ("車掌", .STATION_STAFF), ("警備員", .STATION_STAFF),
            ("店員", .CLERK_APRON), ("バイト", .CLERK_APRON), ("店長", .CLERK_APRON),
            ("買い物客", .SHOPPER_BAG), ("お客", .SHOPPER_BAG), ("客", .SHOPPER_BAG)
        ]

        var best: ConteRoleCostume?
        var bestPosition = -1
        for (keyword, costume) in humanMap {
            guard let range = roleName.range(of: keyword, options: .backwards) else { continue }
            let suffix = String(roleName[range.upperBound...])
            let pos = roleName.distance(from: roleName.startIndex, to: range.lowerBound)
            if ["を", "に", "と", "より", "から"].contains(where: { suffix.hasPrefix($0) }) && !suffix.isEmpty {
                if best == nil { best = costume }
                continue
            }
            if pos >= bestPosition {
                bestPosition = pos
                best = costume
            }
        }
        return best
    }

    static func extract(_ key: String, from text: String) -> ConteRoleCostume? {
        let pattern = "(?:^|[\\r\\n|;,])\\s*\\[?" + NSRegularExpression.escapedPattern(for: key) + "\\s*[:：]\\s*([A-Z_]+)"
        guard let rx = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
        let ns = text as NSString
        guard let match = rx.firstMatch(in: text, range: NSRange(location: 0, length: ns.length)), match.numberOfRanges > 1 else { return nil }
        return ConteRoleCostume(rawValue: ns.substring(with: match.range(at: 1)).uppercased())
    }
}

/// 左右の配役を一意に扱うための共通パーサー
enum ConteCastIdentity {
    static func cleanRole(_ raw: String) -> String {
        raw.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^\s*(?:配役|登場人物|キャラクター)\s*[:：]\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"^\s*(?:左(?:側|役)?|右(?:側|役)?|ボケ役?|ツッコミ役?)\s*[:：]\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"[（(](?:ボケ役?|ツッコミ役?|左(?:側|役)?|右(?:側|役)?)[）)]"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func parsePair(_ raw: String) -> [String] {
        let source = raw.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !source.isEmpty else { return [] }

        let explicit = #"(?s)^\s*(?:(?:配役|登場人物|キャラクター)\s*[:：]\s*)?左(?:側|役)?\s*[:：]\s*(.+?)\s*(?:[,、，／/;；\n]|\s+・\s+|・)\s*右(?:側|役)?\s*[:：]\s*(.+?)\s*$"#
        if let rx = try? NSRegularExpression(pattern: explicit),
           let m = rx.firstMatch(in: source, range: NSRange(source.startIndex..., in: source)),
           m.numberOfRanges >= 3,
           let l = Range(m.range(at: 1), in: source),
           let r = Range(m.range(at: 2), in: source) {
            let pair = [cleanRole(String(source[l])), cleanRole(String(source[r]))]
            if pair.allSatisfy({ !$0.isEmpty }) { return pair }
        }

        let section = source.replacingOccurrences(of: #"^\s*(?:配役|登場人物|キャラクター)\s*[:：]\s*"#, with: "", options: .regularExpression)
        var pieces = section.components(separatedBy: CharacterSet(charactersIn: ",、，／/;；\n"))
            .map(cleanRole).filter { !$0.isEmpty }
        if pieces.count < 2 {
            pieces = section.components(separatedBy: " ・ ").map(cleanRole).filter { !$0.isEmpty }
        }
        if pieces.count < 2 && section.contains("と") {
            let byTo = section.components(separatedBy: "と").map(cleanRole).filter { !$0.isEmpty }
            if byTo.count == 2 { pieces = byTo }
        }
        if pieces.count < 2 && section.contains("・") {
            let byDot = section.components(separatedBy: "・").map(cleanRole).filter { !$0.isEmpty }
            if byDot.count == 2 { pieces = byDot }
        }
        return pieces.count >= 2 ? Array(pieces.prefix(2)) : []
    }

    static func tag(_ key: String, from text: String) -> String? {
        let pattern = #"(?:^|[|\r\n])\s*"# + NSRegularExpression.escapedPattern(for: key) + #"\s*[:：]\s*([^|\r\n]+)"#
        guard let rx = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let m = rx.firstMatch(in: text, range: NSRange(text.startIndex..., in: text)),
              let range = Range(m.range(at: 1), in: text) else { return nil }
        let value = cleanRole(String(text[range]))
        return value.isEmpty ? nil : value
    }

    static func roles(from sceneSetting: String) -> [String] {
        if let left = tag("CAST_LEFT", from: sceneSetting),
           let right = tag("CAST_RIGHT", from: sceneSetting) { return [left, right] }
        if let left = tag("LEFT_ROLE", from: sceneSetting),
           let right = tag("RIGHT_ROLE", from: sceneSetting) { return [left, right] }
        let sections = sceneSetting.components(separatedBy: "|")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        if sections.count >= 3 {
            let pair = parsePair(sections[2])
            if pair.count == 2 { return pair }
        }
        for section in sections where section.range(of: #"^(配役|登場人物|キャラクター)\s*[:：]"#, options: .regularExpression) != nil {
            let pair = parsePair(section)
            if pair.count == 2 { return pair }
        }
        return []
    }
}

struct StageCanvasView: View {
    let activeSpeaker: Int?               // 0: 左(ボケ役), 1: 右(ツッコミ役), nil: なし
    let action: ManzaiActionType          // 現在のアクション
    let animTick: Int                     // 全体アニメーションフレームカウンタ
    let slapTick: Int                     // ツッコミ叩き専用ワンショットカウンタ（1回のみ叩く）
    let blackoutAlpha: CGFloat            // 暗転／明転オーバーレイ濃度
    let isFinished: Bool                  // 終演フラグ
    let propStyle: ContePropStyle         // シチュエーションに応じた舞台セット
    let voiceMode: VoiceMode
    var leftCostume: ConteRoleCostume? = nil
    var rightCostume: ConteRoleCostume? = nil

    static let floorRatio: CGFloat = 0.64

    private struct Pose {
        var offsetX: CGFloat = 0
        var offsetY: CGFloat = 0
        var bodyLeanX: CGFloat = 0
        var bodyRotationDeg: Double = 0
        var headTiltDeg: Double = 0
        var bowOffsetY: CGFloat = 0
        var leftArmX: CGFloat = -20
        var leftArmY: CGFloat = 18
        var rightArmX: CGFloat = 20
        var rightArmY: CGFloat = 18
        var leftLegX: CGFloat = -14
        var leftLegY: CGFloat = 0
        var rightLegX: CGFloat = 14
        var rightLegY: CGFloat = 0
        var eyeMode: Int = 0
        var eyePopOut: CGFloat = 0
        var showSweat: Bool = false
        var showQuestion: Bool = false
        var showNote: Bool = false
        var showImpactExclamation: Bool = false
        var showAngerVein: Bool = false
        var showGloomLines: Bool = false
        var showSparkles: Bool = false
        var isPaleFace: Bool = false
    }

    private func mouthOpenAmount(for side: Int) -> CGFloat {
        guard activeSpeaker == side else { return 0.0 }
        let isLoud = (action == .tsukkomiSlap || action == .tsukkomiPoint || action == .panicShake)
        switch (animTick / 2) % 4 {
        case 0: return 0.15
        case 1: return isLoud ? 1.00 : 0.85
        case 2: return 0.25
        default: return 0.75
        }
    }

    var body: some View {
        GeometryReader { _ in
            Canvas { context, size in
                let w = size.width
                let h = size.height
                let stageTop = h * Self.floorRatio
                let scale = min(max(stageTop / 250.0, 0.52), 0.75)

                drawBackgroundStage(context: &context, size: size, stageTop: stageTop)
                drawBackSet(context: &context, w: w, stageTop: stageTop, scale: scale)
                drawRichBackdrop(context: &context, w: w, stageTop: stageTop, scale: scale)

                let baseLeftX = w * 0.35
                let baseRightX = w * 0.65

                let leftPose = calculatePose(side: 0, scale: scale, stageWidth: w)
                let rightPose = calculatePose(side: 1, scale: scale, stageWidth: w)

                // ★ 動物・物は ConteSpriteOverlay(SpriteKit) 側で描画するため、Canvas側では人間（棒人間）のみを描画して二重口パクを防ぐ
                if !(leftCostume?.isCreature == true || leftCostume?.isObject == true) {
                    drawStickManWithCostume(
                        context: &context,
                        side: 0,
                        baseX: baseLeftX,
                        stageTop: stageTop,
                        mouthOpen: mouthOpenAmount(for: 0),
                        scale: scale,
                        pose: leftPose
                    )
                }

                if !(rightCostume?.isCreature == true || rightCostume?.isObject == true) {
                    drawStickManWithCostume(
                        context: &context,
                        side: 1,
                        baseX: baseRightX,
                        stageTop: stageTop,
                        mouthOpen: mouthOpenAmount(for: 1),
                        scale: scale,
                        pose: rightPose
                    )
                }

                drawFrontPropSet(context: &context, w: w, stageTop: stageTop, scale: scale)

                let isNormalTsukkomi = (action == .tsukkomiPoint)
                let isStrongTsukkomi = (action == .tsukkomiSlap)
                if (isNormalTsukkomi || isStrongTsukkomi), let speaker = activeSpeaker, (1...5).contains(slapTick) {
                    let targetX: CGFloat
                    if speaker == 1 {
                        targetX = baseLeftX + leftPose.offsetX + leftPose.bodyLeanX + 14 * scale
                    } else {
                        targetX = baseRightX + rightPose.offsetX + rightPose.bodyLeanX - 14 * scale
                    }
                    let targetY = stageTop - 135 * scale
                    drawTsukkomiSpark(context: &context, x: targetX, y: targetY, scale: scale, isStrong: isStrongTsukkomi)
                }

                if blackoutAlpha > 0.01 {
                    drawBlackoutOverlay(context: &context, w: w, h: h, alpha: blackoutAlpha)
                }
            }
            .overlay {
                ConteSpriteOverlay(
                    left: leftCostume,
                    right: rightCostume,
                    activeSpeaker: activeSpeaker,
                    action: action,
                    tick: animTick,
                    slapTick: slapTick
                )
                .opacity(Double(max(0, 1.0 - blackoutAlpha)))
                .opacity(isFinished ? 0 : 1)
                .allowsHitTesting(false)
            }
        }
    }

    private func calculatePose(side: Int, scale: CGFloat, stageWidth: CGFloat) -> Pose {
        var p = Pose()
        let isSpeaker = (activeSpeaker == side)
        let t = CGFloat(animTick)

        if (action == .tsukkomiPoint || action == .tsukkomiSlap), activeSpeaker != nil {
            let isStrong = (action == .tsukkomiSlap)

            let swing: CGFloat
            if slapTick < 0 {
                swing = 0.0
            } else if slapTick <= 2 {
                swing = CGFloat(slapTick + 1) / 3.0
            } else if slapTick == 3 {
                swing = 1.0
            } else if slapTick <= 8 {
                swing = max(1.0 - CGFloat(slapTick - 3) / 5.0, 0.0)
            } else {
                swing = 0.0
            }

            let baseLunge = stageWidth * (isStrong ? 0.075 : 0.058)
            let stepX = max(baseLunge, (isStrong ? 26.0 : 20.0) * scale) * swing
            let leanX = (isStrong ? 8.0 : 5.0) * scale * swing
            let armReachX = (isStrong ? 54.0 : 46.0) * swing
            let armReachY = (isStrong ? 48.0 : 42.0) * swing

            if isSpeaker {
                p.showAngerVein = true
                if side == 1 {
                    p.offsetX = -stepX
                    p.offsetY = -2 * scale * swing
                    p.bodyLeanX = -leanX
                    p.headTiltDeg = Double(-8 * swing)
                    p.leftArmX = -20 - armReachX
                    p.leftArmY = 18 - armReachY
                    p.rightArmX = 20 + 10 * swing
                    p.rightArmY = 18 - 8 * swing
                    p.leftLegX = -14 - 8 * swing
                } else {
                    p.offsetX = stepX
                    p.offsetY = -2 * scale * swing
                    p.bodyLeanX = leanX
                    p.headTiltDeg = Double(8 * swing)
                    p.rightArmX = 20 + armReachX
                    p.rightArmY = 18 - armReachY
                    p.leftArmX = -20 - 10 * swing
                    p.leftArmY = 18 - 8 * swing
                    p.rightLegX = 14 + 8 * swing
                }
            } else {
                let recoil: CGFloat
                if (1...3).contains(slapTick) {
                    recoil = 1.0
                } else if (4...8).contains(slapTick) {
                    recoil = max(1.0 - CGFloat(slapTick - 3) / 5.0, 0.0)
                } else {
                    recoil = 0.0
                }

                let recoilX = (isStrong ? 16.0 : 10.0) * scale * recoil
                let recoilTilt = Double((isStrong ? 25.0 : 18.0) * recoil)
                let armLiftY = (isStrong ? 22.0 : 15.0) * recoil

                if side == 0 {
                    p.offsetX = -recoilX
                    p.bodyLeanX = -5 * scale * recoil
                    p.headTiltDeg = -recoilTilt
                    p.leftArmX = -24
                    p.leftArmY = 18 - armLiftY
                    p.rightArmX = 22
                    p.rightArmY = 18 - armLiftY * 0.6
                } else {
                    p.offsetX = recoilX
                    p.bodyLeanX = 5 * scale * recoil
                    p.headTiltDeg = recoilTilt
                    p.rightArmX = 24
                    p.rightArmY = 18 - armLiftY
                    p.leftArmX = -22
                    p.leftArmY = 18 - armLiftY * 0.6
                }

                if recoil > 0.2 {
                    p.eyeMode = 2
                    p.showSweat = true
                    if isStrong {
                        p.showImpactExclamation = (1...5).contains(slapTick)
                    }
                }
            }
            return p
        }

        if action == .zukoke && isSpeaker {
            let fall = min(CGFloat(animTick) / 5.0, 1.0)
            p.offsetY = 42 * scale * fall
            p.bodyRotationDeg = (side == 1 ? 75.0 : -75.0) * Double(fall)
            p.leftArmX = -28
            p.leftArmY = -22 * fall
            p.rightArmX = 28
            p.rightArmY = -22 * fall
            p.leftLegX = -22
            p.leftLegY = -28 * fall
            p.rightLegX = 22
            p.rightLegY = -12 * fall
            p.eyeMode = 2
            p.showSweat = true
            return p
        }

        if action == .dogeza && isSpeaker {
            let bow = min(CGFloat(animTick) / 4.0, 1.0)
            p.offsetY = 48 * scale * bow
            p.bodyLeanX = (side == 0 ? 28.0 : -28.0) * scale * bow
            p.bowOffsetY = 32 * scale * bow
            p.headTiltDeg = (side == 0 ? 45.0 : -45.0) * Double(bow)
            p.leftArmX = -18
            p.leftArmY = 26
            p.rightArmX = 18
            p.rightArmY = 26
            p.eyeMode = 2
            p.showSweat = true
            return p
        }

        if action == .stepClose && isSpeaker {
            let step = min(CGFloat(animTick) / 5.0, 1.0)
            let dir: CGFloat = (side == 0) ? 1.0 : -1.0
            p.offsetX = dir * 26 * scale * step
            p.bodyLeanX = dir * 14 * scale * step
            p.headTiltDeg = Double(dir * 12 * step)
            p.showAngerVein = true
            return p
        }

        if action == .astonished && isSpeaker {
            let jump = abs(sin(t * 0.25))
            p.offsetY = -18 * scale * jump
            p.bodyLeanX = (side == 0 ? -1 : 1) * 6 * scale
            p.leftArmX = -32
            p.leftArmY = -26
            p.rightArmX = 32
            p.rightArmY = -26
            p.eyeMode = 4
            p.eyePopOut = 0.78 + 0.22 * abs(sin(t * 0.55))
            p.showImpactExclamation = true
            return p
        }

        if action == .working && isSpeaker {
            let progress = min(t / 9, 1)
            p.offsetX = (side == 0 ? -1 : 1) * 19 * scale * progress
            p.bodyLeanX = (side == 0 ? -1 : 1) * 8 * scale
            p.headTiltDeg = 12
            p.leftArmX = -14
            p.rightArmX = 14
            p.leftArmY = -8 + sin(t * 0.7) * 13
            p.rightArmY = -8 - sin(t * 0.7) * 13
            return p
        }

        if action == .panicShake && isSpeaker {
            let shake = sin(t * 2.6) * 4.5 * scale
            p.offsetX = shake
            p.leftArmX = -26
            p.leftArmY = -18 + sin(t * 2.0) * 8
            p.rightArmX = 26
            p.rightArmY = -18 - sin(t * 2.0) * 8
            p.eyeMode = 4
            p.eyePopOut = 0.88 + 0.24 * abs(sin(t * 1.3))
            p.isPaleFace = true
            p.showSweat = true
            return p
        }

        if action == .poseCool && isSpeaker {
            p.bodyLeanX = (side == 0 ? -8.0 : 8.0) * scale
            p.headTiltDeg = (side == 0 ? -14.0 : 14.0)
            p.leftArmX = -28
            p.leftArmY = -24
            p.rightArmX = 14
            p.rightArmY = -6
            p.leftLegX = -20
            p.rightLegX = 18
            p.eyeMode = 1
            p.showSparkles = true
            return p
        }

        guard isSpeaker else { return p }

        switch action {
        case .bokeSilly:
            let sway = sin(t * 0.32)
            let cosSway = cos(t * 0.32)
            p.offsetX = sway * 8 * scale
            p.headTiltDeg = Double(sway * 22)
            p.leftArmX = -25
            p.leftArmY = -8 + sway * 14
            p.rightArmX = 25
            p.rightArmY = -8 - sway * 14
            p.eyeMode = 1
            p.showNote = (cosSway > 0.1)

        case .bokeActing:
            let gesture = sin(t * 0.28)
            p.offsetX = gesture * 6 * scale
            p.headTiltDeg = Double(10 * gesture)
            p.leftArmX = -24
            p.leftArmY = -12 + gesture * 10
            p.rightArmX = 24
            p.rightArmY = 2 - gesture * 10
            p.eyeMode = 1

        case .tsukkomiSigh:
            p.bowOffsetY = 12 * scale
            p.headTiltDeg = (side == 1) ? -18 : 18
            p.eyeMode = 3
            p.showSweat = true
            p.showGloomLines = true

        case .questionTilt:
            p.headTiltDeg = (side == 1) ? -18 : 18
            p.showQuestion = true

        default:
            let talkMove = sin(t * 0.24)
            if side == 0 {
                p.rightArmY = 14 - abs(talkMove) * 9
            } else {
                p.leftArmY = 14 - abs(talkMove) * 9
            }
        }

        return p
    }
    // ============================
        // 描画ヘルパー群（舞台セット ＆ 小道具・衣装・マンガ効果）
        // ============================
        private func drawBackgroundStage(context: inout GraphicsContext, size: CGSize, stageTop: CGFloat) {
            let w = size.width
            let h = size.height
            let wall: Color
            let floor: Color
            switch propStyle {
            case .shopCounter: wall = Color(hex: "#E9F8FF"); floor = Color(hex: "#DDE6ED")
            case .interrogation: wall = Color(hex: "#C4D2DC"); floor = Color(hex: "#92A7B5")
            case .hospital: wall = Color(hex: "#EAF8F5"); floor = Color(hex: "#CDE4DE")
            case .classroom: wall = Color(hex: "#FFF8E8"); floor = Color(hex: "#BFA590")
            case .cafeTable: wall = Color(hex: "#FFF2DE"); floor = Color(hex: "#B18B77")
            case .officeDesk: wall = Color(hex: "#E8F1F7"); floor = Color(hex: "#AFC3D0")
            case .bankRobbery: wall = Color(hex: "#D5DFE6"); floor = Color(hex: "#A3B4BD")
            case .fantasyHero: wall = Color(hex: "#64758C"); floor = Color(hex: "#75869B")
            case .taxiCar: wall = Color(hex: "#C6E9FA"); floor = Color(hex: "#6A93AB")
            case .homeLiving: wall = Color(hex: "#FFF5D7"); floor = Color(hex: "#D6B38A")
            case .hairSalon: wall = Color(hex: "#FFF0F6"); floor = Color(hex: "#CADDE2")
            case .gymRing: wall = Color(hex: "#F5F2EB"); floor = Color(hex: "#BDD5E7")
            case .tvStudio: wall = Color(hex: "#DDD5F9"); floor = Color(hex: "#8CA1B9")
            case .trainStation: wall = Color(hex: "#D9ECF7"); floor = Color(hex: "#A1B4C1")
            }
            context.fill(Path(CGRect(x: 0, y: 0, width: w, height: stageTop)), with: .color(wall))
            context.fill(Path(CGRect(x: 0, y: stageTop, width: w, height: h - stageTop)), with: .color(floor))

            var perspective = Path()
            let vanishingX = w / 2
            for n in 0...8 {
                let bottomX = w * CGFloat(n) / 8
                perspective.move(to: CGPoint(x: vanishingX + (bottomX - vanishingX) * 0.15, y: stageTop))
                perspective.addLine(to: CGPoint(x: bottomX, y: h))
            }
            for fraction in [CGFloat(0.16), 0.38, 0.64] {
                let yy = stageTop + (h - stageTop) * fraction
                perspective.move(to: CGPoint(x: 0, y: yy))
                perspective.addLine(to: CGPoint(x: w, y: yy))
            }
            context.stroke(perspective, with: .color(Color.black.opacity(0.075)), lineWidth: 1)
            var edge = Path()
            edge.move(to: CGPoint(x: 0, y: stageTop))
            edge.addLine(to: CGPoint(x: w, y: stageTop))
            context.stroke(edge, with: .color(Color(hex: "#475569").opacity(0.5)), lineWidth: 3)
        }

        private func drawBackSet(context: inout GraphicsContext, w: CGFloat, stageTop: CGFloat, scale: CGFloat) {
            switch propStyle {
            case .classroom:
                let bw = 175 * scale
                let bh = 76 * scale
                let bx = (w - bw) / 2
                let by = stageTop - 178 * scale
                let boardRect = CGRect(x: bx, y: by, width: bw, height: bh)
                context.fill(Path(roundedRect: boardRect, cornerRadius: 3), with: .color(Color(hex: "#2E5A44")))
                context.stroke(Path(roundedRect: boardRect, cornerRadius: 3), with: .color(Color(hex: "#8D6E63")), lineWidth: 4 * scale)
                let chalk = Text("日直").font(.system(size: 10 * scale, weight: .bold)).foregroundColor(.white.opacity(0.85))
                context.draw(chalk, at: CGPoint(x: bx + bw - 20 * scale, y: by + 14 * scale))

            case .shopCounter:
                break

            case .interrogation:
                let cx = w * 0.5
                let cordBottomY = stageTop - 185 * scale
                var cord = Path()
                cord.move(to: CGPoint(x: cx, y: 0))
                cord.addLine(to: CGPoint(x: cx, y: cordBottomY))
                context.stroke(cord, with: .color(.black), lineWidth: 2)
                var shade = Path()
                shade.move(to: CGPoint(x: cx - 18 * scale, y: cordBottomY + 12 * scale))
                shade.addLine(to: CGPoint(x: cx + 18 * scale, y: cordBottomY + 12 * scale))
                shade.addLine(to: CGPoint(x: cx + 8 * scale, y: cordBottomY))
                shade.addLine(to: CGPoint(x: cx - 8 * scale, y: cordBottomY))
                shade.closeSubpath()
                context.fill(shade, with: .color(Color(hex: "#CFD8DC")))
                context.stroke(shade, with: .color(.black), lineWidth: 2)

            case .hospital:
                let cx = w * 0.20
                let cy = stageTop - 150 * scale
                let box = CGRect(x: cx - 22 * scale, y: cy - 22 * scale, width: 44 * scale, height: 44 * scale)
                context.fill(Path(roundedRect: box, cornerRadius: 6), with: .color(.white))
                context.stroke(Path(roundedRect: box, cornerRadius: 6), with: .color(.black), lineWidth: 2)
                context.fill(Path(CGRect(x: cx - 4 * scale, y: cy - 14 * scale, width: 8 * scale, height: 28 * scale)), with: .color(Color(hex: "#E53935")))
                context.fill(Path(CGRect(x: cx - 14 * scale, y: cy - 4 * scale, width: 28 * scale, height: 8 * scale)), with: .color(Color(hex: "#E53935")))

            case .bankRobbery:
                let vx = w * 0.16
                let vy = stageTop - 145 * scale
                let vRect = CGRect(x: vx - 26 * scale, y: vy - 26 * scale, width: 52 * scale, height: 52 * scale)
                context.fill(Path(roundedRect: vRect, cornerRadius: 6), with: .color(Color(hex: "#B0BEC5")))
                context.stroke(Path(roundedRect: vRect, cornerRadius: 6), with: .color(.black), lineWidth: 2.5)
                context.stroke(Path(ellipseIn: CGRect(x: vx - 12 * scale, y: vy - 12 * scale, width: 24 * scale, height: 24 * scale)), with: .color(.black), lineWidth: 2)

            case .fantasyHero:
                for tx in [w * 0.18, w * 0.82] {
                    let ty = stageTop - 135 * scale
                    let holder = CGRect(x: tx - 4 * scale, y: ty, width: 8 * scale, height: 22 * scale)
                    context.fill(Path(holder), with: .color(Color(hex: "#795548")))
                    context.stroke(Path(holder), with: .color(.black), lineWidth: 1.5)
                    let flame = CGRect(x: tx - 8 * scale, y: ty - 16 * scale, width: 16 * scale, height: 18 * scale)
                    context.fill(Path(ellipseIn: flame), with: .color(Color(hex: "#FF6D00")))
                }

            case .hairSalon:
                let mirror = CGRect(x: w * 0.12, y: stageTop - 180 * scale, width: 76 * scale, height: 112 * scale)
                context.fill(Path(roundedRect: mirror, cornerRadius: 8 * scale), with: .color(Color(hex: "#DBEFF7")))
                context.stroke(Path(roundedRect: mirror, cornerRadius: 8 * scale), with: .color(Color(hex: "#5C6C7B")), lineWidth: 5 * scale)

            case .gymRing:
                for offset in [CGFloat(0), CGFloat(21), CGFloat(42)] {
                    var rope = Path()
                    rope.move(to: CGPoint(x: w * 0.06, y: stageTop - (82 * scale + offset * scale)))
                    rope.addLine(to: CGPoint(x: w * 0.94, y: stageTop - (82 * scale + offset * scale)))
                    context.stroke(rope, with: .color(Color(hex: "#0D9488").opacity(0.55)), lineWidth: 2.5 * scale)
                }
                context.draw(Text("GYM").font(.system(size: 18 * scale, weight: .heavy)), at: CGPoint(x: w * 0.18, y: stageTop - 175 * scale))

            case .tvStudio:
                let panel = CGRect(x: w * 0.28, y: stageTop - 196 * scale, width: w * 0.44, height: 43 * scale)
                context.fill(Path(roundedRect: panel, cornerRadius: 8), with: .color(Color(hex: "#DBEAFE")))
                context.stroke(Path(roundedRect: panel, cornerRadius: 8), with: .color(Color(hex: "#2563EB")), lineWidth: 3 * scale)
                context.draw(Text("ON AIR ●").font(.system(size: 14 * scale, weight: .heavy)).foregroundColor(Color(hex: "#1D4ED8")), at: CGPoint(x: w * 0.5, y: stageTop - 175 * scale))

            case .trainStation:
                let sign = CGRect(x: w * 0.19, y: stageTop - 182 * scale, width: w * 0.62, height: 40 * scale)
                context.fill(Path(roundedRect: sign, cornerRadius: 4), with: .color(.white))
                context.stroke(Path(roundedRect: sign, cornerRadius: 4), with: .color(Color(hex: "#0891B2")), lineWidth: 4 * scale)
                context.draw(Text("🚉  STATION  →").font(.system(size: 12 * scale, weight: .bold)), at: CGPoint(x: w * 0.5, y: stageTop - 161 * scale))

            case .taxiCar:
                let mx = w * 0.5
                let my = stageTop - 180 * scale
                let mRect = CGRect(x: mx - 24 * scale, y: my, width: 48 * scale, height: 14 * scale)
                context.fill(Path(roundedRect: mRect, cornerRadius: 3), with: .color(Color(hex: "#E0E0E0")))
                context.stroke(Path(roundedRect: mRect, cornerRadius: 3), with: .color(.black), lineWidth: 2)

            default:
                let winW = 56 * scale
                let winH = 64 * scale
                let winX = w * 0.14
                let winY = stageTop - 155 * scale
                let winRect = CGRect(x: winX, y: winY, width: winW, height: winH)
                context.fill(Path(winRect), with: .color(Color(hex: "#E1F5FE")))
                context.stroke(Path(winRect), with: .color(.black), lineWidth: 2)
                var cross = Path()
                cross.move(to: CGPoint(x: winX + winW / 2, y: winY))
                cross.addLine(to: CGPoint(x: winX + winW / 2, y: winY + winH))
                cross.move(to: CGPoint(x: winX, y: winY + winH / 2))
                cross.addLine(to: CGPoint(x: winX + winW, y: winY + winH / 2))
                context.stroke(cross, with: .color(.black), lineWidth: 1.5)
            }
        }

        private func drawRichBackdrop(context: inout GraphicsContext, w: CGFloat,
                                      stageTop: CGFloat, scale: CGFloat) {
            let ink = Color(hex: "#334155")
            let label: String
            let emoji: String
            switch propStyle {
            case .shopCounter: label = "24H CONVENIENCE"; emoji = "🏪"
            case .interrogation: label = "INTERVIEW ROOM"; emoji = "🚓"
            case .hospital: label = "HOSPITAL"; emoji = "🏥"
            case .classroom: label = "CLASS ROOM"; emoji = "🏫"
            case .cafeTable: label = "CAFE & RESTAURANT"; emoji = "☕"
            case .officeDesk: label = "OFFICE"; emoji = "🏢"
            case .bankRobbery: label = "BANK"; emoji = "🏦"
            case .fantasyHero: label = "FANTASY CASTLE"; emoji = "🏰"
            case .taxiCar: label = "TAXI"; emoji = "🚕"
            case .homeLiving: label = "LIVING ROOM"; emoji = "🏠"
            case .hairSalon: label = "HAIR SALON"; emoji = "💈"
            case .gymRing: label = "GYM & RING"; emoji = "🥊"
            case .tvStudio: label = "TV STUDIO"; emoji = "📺"
            case .trainStation: label = "STATION"; emoji = "🚉"
            }
            let topY = max(6, stageTop - 246 * scale)
            let sign = CGRect(x: w * 0.235, y: topY, width: w * 0.53, height: 31 * scale)
            context.fill(Path(roundedRect: sign, cornerRadius: 7 * scale), with: .color(Color.white.opacity(0.88)))
            context.stroke(Path(roundedRect: sign, cornerRadius: 7 * scale), with: .color(ink.opacity(0.4)), lineWidth: 1.5)
            context.draw(Text("\(emoji)  \(label)").font(.system(size: 12 * scale, weight: .heavy))
                .foregroundColor(ink), at: CGPoint(x: sign.midX, y: sign.midY))

            func rect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat,
                      _ color: Color, radius: CGFloat = 4) {
                let r = CGRect(x: x, y: y, width: width, height: height)
                context.fill(Path(roundedRect: r, cornerRadius: radius * scale), with: .color(color))
                context.stroke(Path(roundedRect: r, cornerRadius: radius * scale),
                               with: .color(ink.opacity(0.72)), lineWidth: 1.4 * scale)
            }
            func symbol(_ emoji: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat = 25) {
                context.draw(Text(emoji).font(.system(size: size * scale)), at: CGPoint(x: x, y: y))
            }
            let left = w * 0.06
            let right = w * 0.78
            let high = stageTop - 192 * scale
            let low = stageTop - 65 * scale
            switch propStyle {
            case .shopCounter:
                for x in [left, right] {
                    rect(x, high, 53 * scale, 133 * scale, Color(hex: "#F8FAFC"))
                    for i in 0..<3 {
                        rect(x + 3 * scale, high + CGFloat(i * 40 + 11) * scale,
                             46 * scale, 6 * scale, Color(hex: "#94A3B8"), radius: 1)
                        for j in 0..<3 {
                            let shades = ["#EF4444", "#22C55E", "#FBBF24"]
                            rect(x + CGFloat(j * 15 + 5) * scale, high + CGFloat(i * 40 + 19) * scale,
                                 10 * scale, 18 * scale, Color(hex: shades[(i + j) % 3]), radius: 2)
                        }
                    }
                }
            case .interrogation:
                rect(left, high + 26 * scale, 85 * scale, 58 * scale, Color(hex: "#334155"))
                rect(left + 9 * scale, high + 37 * scale, 68 * scale, 36 * scale, Color(hex: "#64748B"))
                for i in 0..<6 {
                    rect(w * 0.89, high + CGFloat(i * 19) * scale, 18 * scale, 2 * scale,
                         ink.opacity(0.45), radius: 0)
                }
                symbol("💡", w * 0.52, high + 66 * scale, 32)
            case .hospital:
                rect(left, high + 14 * scale, 77 * scale, 72 * scale, Color.white)
                symbol("❤️", left + 39 * scale, high + 49 * scale, 28)
                rect(right, high + 17 * scale, 55 * scale, 88 * scale, Color(hex: "#E0F2FE"))
                symbol("🩺", right + 26 * scale, high + 59 * scale, 32)
            case .classroom:
                rect(left, high + 12 * scale, 83 * scale, 88 * scale, Color(hex: "#1E5F4E"))
                context.draw(Text("日直  1時間目").font(.system(size: 12 * scale)).foregroundColor(.white),
                             at: CGPoint(x: left + 42 * scale, y: high + 49 * scale))
                symbol("📚", w * 0.89, low - 31 * scale, 35)
            case .cafeTable:
                rect(left, high + 5 * scale, 67 * scale, 103 * scale, Color(hex: "#E2B78B"))
                for i in 0..<3 { symbol("☕", left + 33 * scale, high + CGFloat(26 + i * 27) * scale, 20) }
                rect(right, high + 14 * scale, 69 * scale, 77 * scale, Color(hex: "#FFF7ED"))
                context.draw(Text("MENU").font(.system(size: 13 * scale, weight: .black)),
                             at: CGPoint(x: right + 34 * scale, y: high + 34 * scale))
            case .officeDesk:
                for x in [left, right] {
                    rect(x, high + 18 * scale, 65 * scale, 98 * scale, Color(hex: "#F8FAFC"))
                    for i in 0..<3 {
                        rect(x + 10 * scale, high + CGFloat(35 + i * 24) * scale, 45 * scale, 13 * scale,
                             Color(hex: "#94A3B8"))
                    }
                }
            case .bankRobbery:
                rect(left, high + 5 * scale, 94 * scale, 111 * scale, Color(hex: "#64748B"))
                symbol("🔒", left + 48 * scale, high + 58 * scale, 37)
                symbol("💰", w * 0.88, low - 16 * scale, 37)
            case .fantasyHero:
                for x in [left, right] {
                    rect(x, high + 13 * scale, 54 * scale, 120 * scale, Color(hex: "#475569"), radius: 0)
                    for i in 0..<3 {
                        rect(x + CGFloat((i % 2) * 23 + 6) * scale,
                             high + CGFloat(i * 33 + 24) * scale, 18 * scale, 13 * scale,
                             Color(hex: "#64748B"), radius: 0)
                    }
                    symbol("🔥", x + 28 * scale, high + 15 * scale, 30)
                }
            case .taxiCar:
                rect(left, high + 15 * scale, 79 * scale, 88 * scale, Color(hex: "#B4D8EA"))
                rect(right, high + 15 * scale, 76 * scale, 88 * scale, Color(hex: "#B4D8EA"))
                symbol("🌆", w * 0.13, high + 51 * scale, 37)
                symbol("🏙️", w * 0.86, high + 51 * scale, 37)
            case .homeLiving:
                rect(left, high + 18 * scale, 78 * scale, 77 * scale, Color(hex: "#B8DCEB"))
                symbol("🌤️", left + 40 * scale, high + 53 * scale, 32)
                rect(right, high + 27 * scale, 71 * scale, 72 * scale, Color(hex: "#64748B"))
                symbol("📺", right + 36 * scale, high + 60 * scale, 32)
            case .hairSalon:
                rect(left, high + 7 * scale, 74 * scale, 115 * scale, Color(hex: "#C7EAF3"))
                symbol("🪞", left + 36 * scale, high + 56 * scale, 30)
                rect(right, high + 8 * scale, 70 * scale, 107 * scale, Color(hex: "#FCE7F3"))
            case .gymRing:
                symbol("🏋️", left + 31 * scale, high + 71 * scale, 48)
                symbol("🥊", right + 33 * scale, high + 71 * scale, 43)
                for i in 0..<3 {
                    var rope = Path()
                    rope.move(to: CGPoint(x: 0, y: stageTop - CGFloat(20 + i * 15) * scale))
                    rope.addLine(to: CGPoint(x: w, y: stageTop - CGFloat(20 + i * 15) * scale))
                    context.stroke(rope, with: .color(Color(hex: "#0F766E").opacity(0.3)), lineWidth: 1.5 * scale)
                }
            case .tvStudio:
                rect(left, high + 21 * scale, 79 * scale, 83 * scale, Color(hex: "#64748B"))
                symbol("🎥", left + 40 * scale, high + 64 * scale, 42)
                rect(right, high + 29 * scale, 64 * scale, 60 * scale, Color(hex: "#C7D2FE"))
                symbol("🎙️", right + 32 * scale, high + 56 * scale, 34)
            case .trainStation:
                for x in [left, right] {
                    rect(x, high + 8 * scale, 68 * scale, 117 * scale, Color(hex: "#B6D5E5"))
                    for i in 0..<3 {
                        rect(x + 9 * scale, high + CGFloat(19 + i * 32) * scale,
                             50 * scale, 5 * scale, Color.white)
                    }
                }
                symbol("🚆", w * 0.14, high + 62 * scale, 35)
            }
        }

        private func drawFrontPropSet(context: inout GraphicsContext, w: CGFloat, stageTop: CGFloat, scale: CGFloat) {
            let cx = w * 0.5
            switch propStyle {
            case .shopCounter, .bankRobbery:
                let cw = 52 * scale
                let ch = 48 * scale
                let counterRect = CGRect(x: cx - cw / 2, y: stageTop - ch, width: cw, height: ch)
                context.fill(Path(counterRect), with: .color(Color(hex: "#ECEFF1")))
                context.stroke(Path(counterRect), with: .color(.black), lineWidth: 2)
                let regRect = CGRect(x: cx - 12 * scale, y: stageTop - ch - 16 * scale, width: 24 * scale, height: 16 * scale)
                context.fill(Path(regRect), with: .color(Color(hex: "#CFD8DC")))
                context.stroke(Path(regRect), with: .color(.black), lineWidth: 2)

            case .interrogation:
                let dw = 64 * scale
                let dh = 42 * scale
                let topRect = CGRect(x: cx - dw / 2, y: stageTop - dh, width: dw, height: 7 * scale)
                context.fill(Path(topRect), with: .color(Color(hex: "#B0BEC5")))
                context.stroke(Path(topRect), with: .color(.black), lineWidth: 2)
                var legs = Path()
                legs.move(to: CGPoint(x: cx - dw * 0.4, y: stageTop - dh + 7 * scale))
                legs.addLine(to: CGPoint(x: cx - dw * 0.4, y: stageTop))
                legs.move(to: CGPoint(x: cx + dw * 0.4, y: stageTop - dh + 7 * scale))
                legs.addLine(to: CGPoint(x: cx + dw * 0.4, y: stageTop))
                context.stroke(legs, with: .color(.black), lineWidth: 3 * scale)
                let bowlRect = CGRect(x: cx - 10 * scale, y: stageTop - dh - 9 * scale, width: 20 * scale, height: 9 * scale)
                context.fill(Path(ellipseIn: bowlRect), with: .color(Color(hex: "#D32F2F")))
                context.stroke(Path(ellipseIn: bowlRect), with: .color(.black), lineWidth: 1.8)

            case .hospital:
                let ix = w * 0.86
                var stand = Path()
                stand.move(to: CGPoint(x: ix, y: stageTop - 135 * scale))
                stand.addLine(to: CGPoint(x: ix, y: stageTop))
                stand.move(to: CGPoint(x: ix - 10 * scale, y: stageTop))
                stand.addLine(to: CGPoint(x: ix + 10 * scale, y: stageTop))
                context.stroke(stand, with: .color(.black), lineWidth: 2.2)
                let bagRect = CGRect(x: ix - 6 * scale, y: stageTop - 130 * scale, width: 12 * scale, height: 20 * scale)
                context.fill(Path(roundedRect: bagRect, cornerRadius: 3), with: .color(Color(hex: "#B3E5FC")))
                context.stroke(Path(roundedRect: bagRect, cornerRadius: 3), with: .color(.black), lineWidth: 1.5)

            case .officeDesk, .classroom:
                let dw = 64 * scale
                let dh = 42 * scale
                let topRect = CGRect(x: cx - dw / 2, y: stageTop - dh, width: dw, height: 8 * scale)
                context.fill(Path(topRect), with: .color(Color(hex: "#D7CCC8")))
                context.stroke(Path(topRect), with: .color(.black), lineWidth: 2)
                var legs = Path()
                legs.move(to: CGPoint(x: cx - dw * 0.4, y: stageTop - dh + 8 * scale))
                legs.addLine(to: CGPoint(x: cx - dw * 0.4, y: stageTop))
                legs.move(to: CGPoint(x: cx + dw * 0.4, y: stageTop - dh + 8 * scale))
                legs.addLine(to: CGPoint(x: cx + dw * 0.4, y: stageTop))
                context.stroke(legs, with: .color(.black), lineWidth: 3 * scale)

            case .cafeTable:
                let tw = 54 * scale
                let th = 42 * scale
                var stand = Path()
                stand.move(to: CGPoint(x: cx, y: stageTop - th))
                stand.addLine(to: CGPoint(x: cx, y: stageTop))
                stand.move(to: CGPoint(x: cx - 16 * scale, y: stageTop))
                stand.addLine(to: CGPoint(x: cx + 16 * scale, y: stageTop))
                context.stroke(stand, with: .color(.black), lineWidth: 3 * scale)
                let topOval = CGRect(x: cx - tw / 2, y: stageTop - th - 5 * scale, width: tw, height: 10 * scale)
                context.fill(Path(ellipseIn: topOval), with: .color(Color(hex: "#FFE0B2")))
                context.stroke(Path(ellipseIn: topOval), with: .color(.black), lineWidth: 2)

            case .hairSalon:
                let chair = CGRect(x: cx - 25 * scale, y: stageTop - 37 * scale, width: 50 * scale, height: 27 * scale)
                context.fill(Path(roundedRect: chair, cornerRadius: 7), with: .color(Color(hex: "#67A9BA")))
                context.stroke(Path(roundedRect: chair, cornerRadius: 7), with: .color(.black), lineWidth: 2 * scale)

            case .gymRing:
                context.draw(Text("🏋️").font(.system(size: 29 * scale)), at: CGPoint(x: w * 0.15, y: stageTop - 23 * scale))

            case .tvStudio:
                context.draw(Text("🎥").font(.system(size: 27 * scale)), at: CGPoint(x: w * 0.84, y: stageTop - 70 * scale))
                context.draw(Text("🎙️").font(.system(size: 23 * scale)), at: CGPoint(x: cx, y: stageTop - 30 * scale))

            case .trainStation:
                let gate = CGRect(x: cx - 22 * scale, y: stageTop - 36 * scale, width: 44 * scale, height: 36 * scale)
                context.fill(Path(roundedRect: gate, cornerRadius: 4), with: .color(Color(hex: "#7AB4C6")))
                context.stroke(Path(roundedRect: gate, cornerRadius: 4), with: .color(.black), lineWidth: 2 * scale)
                context.draw(Text("IC").font(.system(size: 10 * scale, weight: .bold)), at: CGPoint(x: cx, y: stageTop - 23 * scale))

            case .taxiCar:
                let driverSide: Int = (rightCostume == .DRIVER_CAP && leftCostume != .DRIVER_CAP) ? 1 : 0
                let hx = w * (driverSide == 0 ? 0.37 : 0.63)
                let hy = stageTop - 68 * scale
                let wheelR = 14 * scale
                context.stroke(Path(ellipseIn: CGRect(x: hx - wheelR, y: hy - wheelR, width: wheelR * 2, height: wheelR * 2)), with: .color(.black), lineWidth: 3 * scale)

            case .homeLiving, .fantasyHero:
                if propStyle == .homeLiving {
                    let tw = 56 * scale
                    let th = 22 * scale
                    let topRect = CGRect(x: cx - tw / 2, y: stageTop - th, width: tw, height: 6 * scale)
                    context.fill(Path(topRect), with: .color(Color(hex: "#A1887F")))
                    context.stroke(Path(topRect), with: .color(.black), lineWidth: 2)
                    var legs = Path()
                    legs.move(to: CGPoint(x: cx - tw * 0.38, y: stageTop - th + 6 * scale))
                    legs.addLine(to: CGPoint(x: cx - tw * 0.42, y: stageTop))
                    legs.move(to: CGPoint(x: cx + tw * 0.38, y: stageTop - th + 6 * scale))
                    legs.addLine(to: CGPoint(x: cx + tw * 0.42, y: stageTop))
                    context.stroke(legs, with: .color(.black), lineWidth: 2.5 * scale)
                }
            }
        }

        /// ★ 全身コスチューム・手持ち小道具・マンガ的ギャグエフェクトつきの棒人間描画
        private func drawStickManWithCostume(
            context: inout GraphicsContext,
            side: Int,
            baseX: CGFloat,
            stageTop: CGFloat,
            mouthOpen: CGFloat,
            scale: CGFloat,
            pose: Pose
        ) {
            let costume = (side == 0 ? leftCostume : rightCostume)
            let hipX = baseX + pose.offsetX
            let headX = hipX + pose.bodyLeanX
            let shoulderX = hipX + pose.bodyLeanX * 0.65

            let headY = stageTop - 140 * scale + pose.offsetY + pose.bowOffsetY
            let shoulderY = headY + 38 * scale
            let bodyY = stageTop - 70 * scale + pose.offsetY
            let legY = stageTop
            let headRadius = 22 * scale
            let strokeStyle = StrokeStyle(lineWidth: 5.2 * scale, lineCap: .round, lineJoin: .round)

            let isHero = (costume == .HERO_SWORD) || (costume == nil && propStyle == .fantasyHero && side == 0)
            let isRobber = (costume == .ROBBER_MASK) || (costume == nil && propStyle == .bankRobbery && side == 0)

            context.drawLayer { charLayer in
                if abs(pose.bodyRotationDeg) > 0.5 {
                    charLayer.translateBy(x: hipX, y: bodyY)
                    charLayer.rotate(by: .degrees(pose.bodyRotationDeg))
                    charLayer.translateBy(x: -hipX, y: -bodyY)
                }

                let leftHandPt = CGPoint(x: shoulderX + pose.leftArmX * scale, y: shoulderY + pose.leftArmY * scale)
                let rightHandPt = CGPoint(x: shoulderX + pose.rightArmX * scale, y: shoulderY + pose.rightArmY * scale)

                if isHero {
                    var cape = Path()
                    let dir: CGFloat = (side == 0) ? -1.0 : 1.0
                    cape.move(to: CGPoint(x: shoulderX, y: shoulderY - 4 * scale))
                    cape.addLine(to: CGPoint(x: hipX + dir * 24 * scale, y: bodyY + 12 * scale))
                    cape.addLine(to: CGPoint(x: hipX + dir * 6 * scale, y: bodyY + 14 * scale))
                    cape.closeSubpath()
                    charLayer.fill(cape, with: .color(Color(hex: "#D32F2F")))
                }

                var bodyPath = Path()
                bodyPath.move(to: CGPoint(x: hipX, y: bodyY))
                bodyPath.addLine(to: CGPoint(x: hipX + pose.leftLegX * scale, y: legY + pose.leftLegY * scale))
                bodyPath.move(to: CGPoint(x: hipX, y: bodyY))
                bodyPath.addLine(to: CGPoint(x: hipX + pose.rightLegX * scale, y: legY + pose.rightLegY * scale))
                bodyPath.move(to: CGPoint(x: headX, y: headY + headRadius))
                bodyPath.addLine(to: CGPoint(x: hipX, y: bodyY))
                bodyPath.move(to: CGPoint(x: shoulderX, y: shoulderY))
                bodyPath.addLine(to: leftHandPt)
                bodyPath.move(to: CGPoint(x: shoulderX, y: shoulderY))
                bodyPath.addLine(to: rightHandPt)
                charLayer.stroke(bodyPath, with: .color(.black), style: strokeStyle)

                if let costume {
                    switch costume {
                    case .BOSS_RED_TIE, .POLICE_DETECTIVE:
                        var tie = Path()
                        tie.move(to: CGPoint(x: shoulderX, y: headY + headRadius + 2 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX - 4 * scale, y: shoulderY + 16 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX, y: shoulderY + 22 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX + 4 * scale, y: shoulderY + 16 * scale))
                        tie.closeSubpath()
                        charLayer.fill(tie, with: .color(Color(hex: "#D32F2F")))

                    case .APPLICANT_BLUE_TIE, .STATION_STAFF:
                        var tie = Path()
                        tie.move(to: CGPoint(x: shoulderX, y: headY + headRadius + 2 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX - 4 * scale, y: shoulderY + 16 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX, y: shoulderY + 22 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX + 4 * scale, y: shoulderY + 16 * scale))
                        tie.closeSubpath()
                        charLayer.fill(tie, with: .color(Color(hex: "#1976D2")))

                    case .CLERK_APRON:
                        let apron = CGRect(x: shoulderX - 9 * scale, y: shoulderY + 2 * scale, width: 18 * scale, height: 24 * scale)
                        charLayer.fill(Path(roundedRect: apron, cornerRadius: 2), with: .color(Color(hex: "#43A047")))
                        charLayer.stroke(Path(roundedRect: apron, cornerRadius: 2), with: .color(.black), lineWidth: 1.5)

                    case .WAITER_TRAY:
                        let bowY = headY + headRadius + 5 * scale
                        var bow = Path()
                        bow.move(to: CGPoint(x: shoulderX - 7 * scale, y: bowY - 4 * scale))
                        bow.addLine(to: CGPoint(x: shoulderX + 7 * scale, y: bowY + 4 * scale))
                        bow.addLine(to: CGPoint(x: shoulderX + 7 * scale, y: bowY - 4 * scale))
                        bow.addLine(to: CGPoint(x: shoulderX - 7 * scale, y: bowY + 4 * scale))
                        bow.closeSubpath()
                        charLayer.fill(bow, with: .color(Color(hex: "#C62828")))

                    case .DOCTOR_COAT:
                        let stethR = 5 * scale
                        let stethPt = CGPoint(x: shoulderX + 7 * scale, y: shoulderY + 12 * scale)
                        charLayer.fill(Path(ellipseIn: CGRect(x: stethPt.x - stethR, y: stethPt.y - stethR, width: stethR * 2, height: stethR * 2)), with: .color(Color(hex: "#90A4AE")))
                        charLayer.stroke(Path(ellipseIn: CGRect(x: stethPt.x - stethR, y: stethPt.y - stethR, width: stethR * 2, height: stethR * 2)), with: .color(.black), lineWidth: 1.5)

                    default:
                        break
                    }
                } else {
                    switch propStyle {
                    case .officeDesk, .interrogation:
                        let tieColor = (side == 1) ? Color(hex: "#D32F2F") : Color(hex: "#1976D2")
                        var tie = Path()
                        tie.move(to: CGPoint(x: shoulderX, y: headY + headRadius + 2 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX - 4 * scale, y: shoulderY + 16 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX, y: shoulderY + 22 * scale))
                        tie.addLine(to: CGPoint(x: shoulderX + 4 * scale, y: shoulderY + 16 * scale))
                        tie.closeSubpath()
                        charLayer.fill(tie, with: .color(tieColor))

                    case .shopCounter where side == 1:
                        let apron = CGRect(x: shoulderX - 9 * scale, y: shoulderY + 2 * scale, width: 18 * scale, height: 24 * scale)
                        charLayer.fill(Path(roundedRect: apron, cornerRadius: 2), with: .color(Color(hex: "#43A047")))
                        charLayer.stroke(Path(roundedRect: apron, cornerRadius: 2), with: .color(.black), lineWidth: 1.5)

                    case .cafeTable where side == 1:
                        let bowY = headY + headRadius + 5 * scale
                        var bow = Path()
                        bow.move(to: CGPoint(x: shoulderX - 7 * scale, y: bowY - 4 * scale))
                        bow.addLine(to: CGPoint(x: shoulderX + 7 * scale, y: bowY + 4 * scale))
                        bow.addLine(to: CGPoint(x: shoulderX + 7 * scale, y: bowY - 4 * scale))
                        bow.addLine(to: CGPoint(x: shoulderX - 7 * scale, y: bowY + 4 * scale))
                        bow.closeSubpath()
                        charLayer.fill(bow, with: .color(Color(hex: "#C62828")))

                    case .hospital where side == 0:
                        let stethR = 5 * scale
                        let stethPt = CGPoint(x: shoulderX + 7 * scale, y: shoulderY + 12 * scale)
                        charLayer.fill(Path(ellipseIn: CGRect(x: stethPt.x - stethR, y: stethPt.y - stethR, width: stethR * 2, height: stethR * 2)), with: .color(Color(hex: "#90A4AE")))
                        charLayer.stroke(Path(ellipseIn: CGRect(x: stethPt.x - stethR, y: stethPt.y - stethR, width: stethR * 2, height: stethR * 2)), with: .color(.black), lineWidth: 1.5)

                    default:
                        break
                    }
                }

                drawHandProps(context: &charLayer, side: side, costume: costume, leftHand: leftHandPt, rightHand: rightHandPt, scale: scale)

                charLayer.drawLayer { headLayer in
                    headLayer.translateBy(x: headX, y: headY)
                    headLayer.rotate(by: .degrees(pose.headTiltDeg))
                    headLayer.translateBy(x: -headX, y: -headY)

                    let headRect = CGRect(x: headX - headRadius, y: headY - headRadius, width: headRadius * 2, height: headRadius * 2)
                    let faceColor: Color = {
                        if isRobber { return Color(hex: "#37474F") }
                        if pose.isPaleFace { return Color(hex: "#E1F5FE") }
                        return .white
                    }()
                    headLayer.fill(Path(ellipseIn: headRect), with: .color(faceColor))
                    headLayer.stroke(Path(ellipseIn: headRect), with: .color(.black), style: strokeStyle)

                    drawHeadgear(context: &headLayer, side: side, costume: costume, headX: headX, headY: headY, headRadius: headRadius, scale: scale)

                    let eyeY = headY - 5 * scale
                    let eyeOffsetX = 7 * scale
                    let eyeColor: Color = isRobber ? .white : .black
                    let eyeStroke = StrokeStyle(lineWidth: 3.0 * scale, lineCap: .round)
                    var eyePath = Path()

                    switch pose.eyeMode {
                    case 1:
                        eyePath.addArc(center: CGPoint(x: headX - eyeOffsetX, y: eyeY), radius: 4 * scale, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
                        eyePath.addArc(center: CGPoint(x: headX + eyeOffsetX, y: eyeY), radius: 4 * scale, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false)
                        headLayer.stroke(eyePath, with: .color(eyeColor), style: eyeStroke)
                    case 2:
                        eyePath.move(to: CGPoint(x: headX - eyeOffsetX - 4 * scale, y: eyeY - 4 * scale))
                        eyePath.addLine(to: CGPoint(x: headX - eyeOffsetX + 3 * scale, y: eyeY))
                        eyePath.addLine(to: CGPoint(x: headX - eyeOffsetX - 4 * scale, y: eyeY + 4 * scale))
                        eyePath.move(to: CGPoint(x: headX + eyeOffsetX + 4 * scale, y: eyeY - 4 * scale))
                        eyePath.addLine(to: CGPoint(x: headX + eyeOffsetX - 3 * scale, y: eyeY))
                        eyePath.addLine(to: CGPoint(x: headX + eyeOffsetX + 4 * scale, y: eyeY + 4 * scale))
                        headLayer.stroke(eyePath, with: .color(eyeColor), style: eyeStroke)
                    case 3:
                        eyePath.move(to: CGPoint(x: headX - eyeOffsetX - 4 * scale, y: eyeY))
                        eyePath.addLine(to: CGPoint(x: headX - eyeOffsetX + 4 * scale, y: eyeY))
                        eyePath.move(to: CGPoint(x: headX + eyeOffsetX - 4 * scale, y: eyeY))
                        eyePath.addLine(to: CGPoint(x: headX + eyeOffsetX + 4 * scale, y: eyeY))
                        headLayer.stroke(eyePath, with: .color(eyeColor), style: eyeStroke)
                    case 4:
                        let pop = max(0.0, pose.eyePopOut)
                        let leftOrigin = CGPoint(x: headX - eyeOffsetX, y: eyeY)
                        let rightOrigin = CGPoint(x: headX + eyeOffsetX, y: eyeY)
                        // 左側の役は右斜め上、右側の役は左斜め上（相手の方向）。
                        // 目のソケットは描画せず、飛び出した眼球だけを描く。
                        let towardPartner: CGFloat = (side == 0) ? 1.0 : -1.0
                        let shift = CGPoint(x: towardPartner * 8.0 * scale * pop, y: -10.0 * scale * pop)
                        let leftBall = CGPoint(x: leftOrigin.x + shift.x, y: leftOrigin.y + shift.y)
                        let rightBall = CGPoint(x: rightOrigin.x + shift.x, y: rightOrigin.y + shift.y)
                        var stalks = Path()
                        stalks.move(to: leftOrigin)
                        stalks.addQuadCurve(to: leftBall, control: CGPoint(x: leftOrigin.x + towardPartner * 4.0 * scale, y: leftOrigin.y - 5.0 * scale))
                        stalks.move(to: rightOrigin)
                        stalks.addQuadCurve(to: rightBall, control: CGPoint(x: rightOrigin.x + towardPartner * 4.0 * scale, y: rightOrigin.y - 5.0 * scale))
                        headLayer.stroke(stalks, with: .color(eyeColor), style: StrokeStyle(lineWidth: 1.8 * scale, lineCap: .round))

                        let ballR = 4.6 * scale
                        headLayer.fill(Path(ellipseIn: CGRect(x: leftBall.x - ballR, y: leftBall.y - ballR, width: ballR * 2, height: ballR * 2)), with: .color(.white))
                        headLayer.fill(Path(ellipseIn: CGRect(x: rightBall.x - ballR, y: rightBall.y - ballR, width: ballR * 2, height: ballR * 2)), with: .color(.white))
                        headLayer.stroke(Path(ellipseIn: CGRect(x: leftBall.x - ballR, y: leftBall.y - ballR, width: ballR * 2, height: ballR * 2)), with: .color(eyeColor), lineWidth: 1.8 * scale)
                        headLayer.stroke(Path(ellipseIn: CGRect(x: rightBall.x - ballR, y: rightBall.y - ballR, width: ballR * 2, height: ballR * 2)), with: .color(eyeColor), lineWidth: 1.8 * scale)

                        let pupilR = 1.75 * scale
                        headLayer.fill(Path(ellipseIn: CGRect(x: leftBall.x - pupilR - 0.4 * scale, y: leftBall.y - pupilR, width: pupilR * 2, height: pupilR * 2)), with: .color(eyeColor))
                        headLayer.fill(Path(ellipseIn: CGRect(x: rightBall.x - pupilR + 0.4 * scale, y: rightBall.y - pupilR, width: pupilR * 2, height: pupilR * 2)), with: .color(eyeColor))
                    default:
                        let r = 2.5 * scale
                        headLayer.fill(Path(ellipseIn: CGRect(x: headX - eyeOffsetX - r, y: eyeY - r, width: r * 2, height: r * 2)), with: .color(eyeColor))
                        headLayer.fill(Path(ellipseIn: CGRect(x: headX + eyeOffsetX - r, y: eyeY - r, width: r * 2, height: r * 2)), with: .color(eyeColor))
                    }

                    // ★ 棒人間の口（喋っている側だけ大きく開閉し、黙っている側は一本の線に閉じる）
                    if mouthOpen > 0.05 {
                        let mouthH = (2.0 + 11.0 * mouthOpen) * scale
                        let mouthRect = CGRect(
                            x: headX - 8 * scale,
                            y: headY + 7 * scale - mouthH / 2,
                            width: 16 * scale,
                            height: mouthH
                        )
                        headLayer.fill(Path(roundedRect: mouthRect, cornerRadius: 2 * scale), with: .color(eyeColor))
                    } else {
                        var closedLine = Path()
                        closedLine.move(to: CGPoint(x: headX - 7 * scale, y: headY + 7 * scale))
                        closedLine.addLine(to: CGPoint(x: headX + 7 * scale, y: headY + 7 * scale))
                        headLayer.stroke(closedLine, with: .color(eyeColor), style: StrokeStyle(lineWidth: 2.2 * scale, lineCap: .round))
                    }

                    if pose.showSweat {
                        let sx = headX + headRadius + 6 * scale
                        let sy = headY - 8 * scale
                        var sweat = Path()
                        sweat.move(to: CGPoint(x: sx, y: sy - 6 * scale))
                        sweat.addLine(to: CGPoint(x: sx - 5 * scale, y: sy + 5 * scale))
                        sweat.addLine(to: CGPoint(x: sx + 5 * scale, y: sy + 5 * scale))
                        sweat.closeSubpath()
                        sweat.addEllipse(in: CGRect(x: sx - 5 * scale, y: sy + 1 * scale, width: 10 * scale, height: 10 * scale))
                        headLayer.fill(sweat, with: .color(Color(hex: "#0288D1")))
                    }

                    if pose.showGloomLines {
                        var gloom = Path()
                        for i in 0..<3 {
                            let gx = headX + headRadius - CGFloat(i * 6) * scale
                            let gy = headY - headRadius - 4 * scale
                            gloom.move(to: CGPoint(x: gx, y: gy))
                            gloom.addLine(to: CGPoint(x: gx, y: gy + 16 * scale))
                        }
                        headLayer.stroke(gloom, with: .color(Color(hex: "#3949AB")), lineWidth: 2.2 * scale)
                    }
                }
            }

            if pose.showImpactExclamation {
                let txt = Text("！").font(.system(size: 28 * scale, weight: .black)).foregroundColor(Color(hex: "#D32F2F"))
                context.draw(txt, at: CGPoint(x: headX - 26 * scale, y: headY - headRadius - 12 * scale))
            } else if pose.showAngerVein {
                let txt = Text("💢").font(.system(size: 22 * scale))
                context.draw(txt, at: CGPoint(x: headX + 24 * scale, y: headY - headRadius - 8 * scale))
            } else if pose.showSparkles {
                let txt = Text("✨").font(.system(size: 24 * scale))
                context.draw(txt, at: CGPoint(x: headX - 26 * scale, y: headY - headRadius - 10 * scale))
            } else if pose.showQuestion {
                let txt = Text("？").font(.system(size: 24 * scale, weight: .bold)).foregroundColor(Color(hex: "#E65100"))
                context.draw(txt, at: CGPoint(x: headX + 26 * scale, y: headY - headRadius - 10 * scale))
            } else if pose.showNote {
                let txt = Text("♪").font(.system(size: 24 * scale, weight: .bold)).foregroundColor(Color(hex: "#F57C00"))
                context.draw(txt, at: CGPoint(x: headX - 26 * scale, y: headY - headRadius - 10 * scale))
            }
        }

        private func drawHandProps(context: inout GraphicsContext, side: Int, costume: ConteRoleCostume?, leftHand: CGPoint, rightHand: CGPoint, scale: CGFloat) {
            if let costume {
                let hand: CGPoint = rightHand
                let item: String
                switch costume {
                case .BARBER_SCISSORS: item = "✂️"
                case .SHOPPER_BAG: item = "🛍️"
                case .TEACHER_POINTER: item = "📏"
                case .WAITER_TRAY: item = "🍽️"
                case .CAFE_GUEST_MENU: item = "📖"
                case .HERO_SWORD: item = "⚔️"
                case .DEMON_MAGE_STAFF: item = "🪄"
                case .MC_MIC: item = "🎤"
                default: item = ""
                }
                if !item.isEmpty {
                    context.draw(Text(item).font(.system(size: 24 * scale)),
                                 at: CGPoint(x: hand.x + 5 * scale, y: hand.y - 9 * scale))
                }
                switch costume {
                case .CLERK_APRON:
                    let scan = CGRect(x: leftHand.x - 5 * scale, y: leftHand.y - 5 * scale, width: 13 * scale, height: 8 * scale)
                    context.fill(Path(roundedRect: scan, cornerRadius: 2 * scale), with: .color(Color(hex: "#424242")))
                case .DOCTOR_COAT:
                    let syr = CGRect(x: rightHand.x - 4 * scale, y: rightHand.y - 24 * scale, width: 8 * scale, height: 22 * scale)
                    context.fill(Path(syr), with: .color(Color(hex: "#E0F7FA")))
                    context.stroke(Path(syr), with: .color(.black), lineWidth: 1.8)
                    var needle = Path()
                    needle.move(to: CGPoint(x: rightHand.x, y: rightHand.y - 24 * scale))
                    needle.addLine(to: CGPoint(x: rightHand.x, y: rightHand.y - 36 * scale))
                    context.stroke(needle, with: .color(.black), lineWidth: 1.5)
                case .ROBBER_MASK:
                    let sack = CGRect(x: leftHand.x - 12 * scale, y: leftHand.y - 4 * scale, width: 20 * scale, height: 22 * scale)
                    context.fill(Path(ellipseIn: sack), with: .color(Color(hex: "#FFF8E1")))
                    context.stroke(Path(ellipseIn: sack), with: .color(.black), lineWidth: 1.8)
                    let yen = Text("¥").font(.system(size: 11 * scale, weight: .bold)).foregroundColor(.black)
                    context.draw(yen, at: CGPoint(x: leftHand.x - 2 * scale, y: leftHand.y + 7 * scale))
                default:
                    break
                }
                return
            }

            if propStyle == .hairSalon {
                if side == 0 {
                    context.draw(Text("✂️").font(.system(size: 24 * scale)),
                                 at: CGPoint(x: rightHand.x + 5 * scale, y: rightHand.y - 9 * scale))
                }
                return
            }
            switch propStyle {
            case .shopCounter:
                if side == 0 {
                    let bag = CGRect(x: leftHand.x - 8 * scale, y: leftHand.y, width: 16 * scale, height: 20 * scale)
                    context.fill(Path(roundedRect: bag, cornerRadius: 3), with: .color(Color(hex: "#FFF9C4")))
                    context.stroke(Path(roundedRect: bag, cornerRadius: 3), with: .color(.black), lineWidth: 1.5)
                } else {
                    let scan = CGRect(x: leftHand.x - 10 * scale, y: leftHand.y - 4 * scale, width: 12 * scale, height: 6 * scale)
                    context.fill(Path(scan), with: .color(Color(hex: "#424242")))
                }

            case .hospital:
                if side == 0 {
                    let syr = CGRect(x: rightHand.x - 4 * scale, y: rightHand.y - 24 * scale, width: 8 * scale, height: 22 * scale)
                    context.fill(Path(syr), with: .color(Color(hex: "#E0F7FA")))
                    context.stroke(Path(syr), with: .color(.black), lineWidth: 1.8)
                    var needle = Path()
                    needle.move(to: CGPoint(x: rightHand.x, y: rightHand.y - 24 * scale))
                    needle.addLine(to: CGPoint(x: rightHand.x, y: rightHand.y - 36 * scale))
                    context.stroke(needle, with: .color(.black), lineWidth: 1.5)
                }

            case .classroom:
                if side == 1 {
                    var pointer = Path()
                    pointer.move(to: leftHand)
                    pointer.addLine(to: CGPoint(x: leftHand.x - 20 * scale, y: leftHand.y - 24 * scale))
                    context.stroke(pointer, with: .color(Color(hex: "#8D6E63")), lineWidth: 3 * scale)
                }

            case .cafeTable:
                if side == 1 {
                    let trayRect = CGRect(x: leftHand.x - 18 * scale, y: leftHand.y - 4 * scale, width: 26 * scale, height: 5 * scale)
                    context.fill(Path(ellipseIn: trayRect), with: .color(Color(hex: "#B0BEC5")))
                    context.stroke(Path(ellipseIn: trayRect), with: .color(.black), lineWidth: 1.5)
                } else {
                    let menu = CGRect(x: rightHand.x - 6 * scale, y: rightHand.y - 14 * scale, width: 12 * scale, height: 16 * scale)
                    context.fill(Path(menu), with: .color(Color(hex: "#8D6E63")))
                    context.stroke(Path(menu), with: .color(.black), lineWidth: 1.5)
                }

            case .bankRobbery:
                if side == 0 {
                    let sack = CGRect(x: leftHand.x - 12 * scale, y: leftHand.y - 4 * scale, width: 20 * scale, height: 22 * scale)
                    context.fill(Path(ellipseIn: sack), with: .color(Color(hex: "#FFF8E1")))
                    context.stroke(Path(ellipseIn: sack), with: .color(.black), lineWidth: 1.8)
                    let yen = Text("¥").font(.system(size: 11 * scale, weight: .bold)).foregroundColor(.black)
                    context.draw(yen, at: CGPoint(x: leftHand.x - 2 * scale, y: leftHand.y + 7 * scale))
                }

            case .fantasyHero:
                if side == 0 {
                    let tip = CGPoint(x: rightHand.x + 20 * scale, y: rightHand.y - 40 * scale)
                    let baseCenter = CGPoint(x: rightHand.x + 5 * scale, y: rightHand.y - 8 * scale)
                    var blade = Path()
                    blade.move(to: tip)
                    blade.addLine(to: CGPoint(x: baseCenter.x + 4.6 * scale, y: baseCenter.y))
                    blade.addLine(to: CGPoint(x: baseCenter.x + 3.0 * scale, y: rightHand.y + 2 * scale))
                    blade.addLine(to: CGPoint(x: baseCenter.x - 3.0 * scale, y: rightHand.y + 2 * scale))
                    blade.addLine(to: CGPoint(x: baseCenter.x - 4.6 * scale, y: baseCenter.y))
                    blade.closeSubpath()
                    context.fill(blade, with: .color(Color(hex: "#D7E2EA")))
                    context.stroke(blade, with: .color(Color(hex: "#455A64")), lineWidth: 1.4 * scale)

                    var fuller = Path()
                    fuller.move(to: CGPoint(x: tip.x, y: tip.y + 7 * scale))
                    fuller.addLine(to: CGPoint(x: baseCenter.x, y: baseCenter.y + 1.5 * scale))
                    context.stroke(fuller, with: .color(Color.white.opacity(0.9)), lineWidth: 1.1 * scale)

                    let guardRect = CGRect(x: rightHand.x - 1 * scale, y: rightHand.y - 8 * scale, width: 15 * scale, height: 4.8 * scale)
                    context.fill(Path(roundedRect: guardRect, cornerRadius: 2 * scale), with: .color(Color(hex: "#C9A15A")))
                    context.stroke(Path(roundedRect: guardRect, cornerRadius: 2 * scale), with: .color(Color(hex: "#5D4037")), lineWidth: 1.2 * scale)

                    let gripRect = CGRect(x: rightHand.x + 4.8 * scale, y: rightHand.y - 3 * scale, width: 3.8 * scale, height: 15 * scale)
                    context.fill(Path(roundedRect: gripRect, cornerRadius: 1.6 * scale), with: .color(Color(hex: "#6D4C41")))
                    context.stroke(Path(roundedRect: gripRect, cornerRadius: 1.6 * scale), with: .color(Color(hex: "#3E2723")), lineWidth: 1.0 * scale)

                    let pommel = CGRect(x: rightHand.x + 4.2 * scale, y: rightHand.y + 11 * scale, width: 5.0 * scale, height: 5.0 * scale)
                    context.fill(Path(ellipseIn: pommel), with: .color(Color(hex: "#B0BEC5")))
                    context.stroke(Path(ellipseIn: pommel), with: .color(Color(hex: "#455A64")), lineWidth: 1.0 * scale)
                } else {
                    var staff = Path()
                    staff.move(to: leftHand)
                    staff.addLine(to: CGPoint(x: leftHand.x - 12 * scale, y: leftHand.y - 32 * scale))
                    context.stroke(staff, with: .color(Color(hex: "#6D4C41")), lineWidth: 3 * scale)
                    let orb = CGRect(x: leftHand.x - 17 * scale, y: leftHand.y - 38 * scale, width: 10 * scale, height: 10 * scale)
                    context.fill(Path(ellipseIn: orb), with: .color(Color(hex: "#AB47BC")))
                }

            default:
                break
            }
        }

        private func drawHeadgear(context: inout GraphicsContext, side: Int, costume: ConteRoleCostume?, headX: CGFloat, headY: CGFloat, headRadius: CGFloat, scale: CGFloat) {
            if let costume {
                switch costume {
                case .CLERK_APRON:
                    let capRect = CGRect(x: headX - headRadius * 0.9, y: headY - headRadius - 8 * scale, width: headRadius * 1.8, height: 10 * scale)
                    context.fill(Path(roundedRect: capRect, cornerRadius: 3), with: .color(Color(hex: "#1E88E5")))
                    context.stroke(Path(roundedRect: capRect, cornerRadius: 3), with: .color(.black), lineWidth: 2)

                case .POLICE_DETECTIVE, .STATION_STAFF:
                    let capRect = CGRect(x: headX - headRadius, y: headY - headRadius - 10 * scale, width: headRadius * 2, height: 12 * scale)
                    context.fill(Path(roundedRect: capRect, cornerRadius: 3), with: .color(Color(hex: "#263238")))
                    context.stroke(Path(roundedRect: capRect, cornerRadius: 3), with: .color(.black), lineWidth: 2)
                    let badge = CGRect(x: headX - 3 * scale, y: headY - headRadius - 7 * scale, width: 6 * scale, height: 6 * scale)
                    context.fill(Path(ellipseIn: badge), with: .color(Color(hex: "#FFD54F")))

                case .SUSPECT_GLASSES:
                    let g1 = CGRect(x: headX - 13 * scale, y: headY - 9 * scale, width: 11 * scale, height: 7 * scale)
                    let g2 = CGRect(x: headX + 2 * scale, y: headY - 9 * scale, width: 11 * scale, height: 7 * scale)
                    context.fill(Path(g1), with: .color(.black))
                    context.fill(Path(g2), with: .color(.black))

                case .DOCTOR_COAT:
                    var band = Path()
                    band.move(to: CGPoint(x: headX - headRadius * 0.85, y: headY - 12 * scale))
                    band.addLine(to: CGPoint(x: headX + headRadius * 0.85, y: headY - 12 * scale))
                    context.stroke(band, with: .color(.black), lineWidth: 2.5 * scale)
                    let mirrorR = 6 * scale
                    let mirrorRect = CGRect(x: headX - mirrorR, y: headY - headRadius - mirrorR * 0.5, width: mirrorR * 2, height: mirrorR * 2)
                    context.fill(Path(ellipseIn: mirrorRect), with: .color(Color(hex: "#E0F7FA")))
                    context.stroke(Path(ellipseIn: mirrorRect), with: .color(.black), lineWidth: 2)

                case .PATIENT_BANDAGE:
                    let bandage = CGRect(x: headX - headRadius, y: headY - headRadius - 2 * scale, width: headRadius * 2, height: 9 * scale)
                    context.fill(Path(roundedRect: bandage, cornerRadius: 3), with: .color(.white))
                    context.stroke(Path(roundedRect: bandage, cornerRadius: 3), with: .color(.black), lineWidth: 1.8)

                case .TEACHER_POINTER:
                    var hat = Path()
                    hat.move(to: CGPoint(x: headX, y: headY - headRadius - 12 * scale))
                    hat.addLine(to: CGPoint(x: headX + 24 * scale, y: headY - headRadius - 4 * scale))
                    hat.addLine(to: CGPoint(x: headX, y: headY - headRadius + 2 * scale))
                    hat.addLine(to: CGPoint(x: headX - 24 * scale, y: headY - headRadius - 4 * scale))
                    hat.closeSubpath()
                    context.fill(hat, with: .color(.black))

                case .STUDENT_CAP:
                    let cap = CGRect(x: headX - headRadius * 0.85, y: headY - headRadius - 7 * scale, width: headRadius * 1.7, height: 9 * scale)
                    context.fill(Path(roundedRect: cap, cornerRadius: 4), with: .color(Color(hex: "#E53935")))
                    context.stroke(Path(roundedRect: cap, cornerRadius: 4), with: .color(.black), lineWidth: 1.8)

                case .HERO_SWORD:
                    var crown = Path()
                    crown.move(to: CGPoint(x: headX - 14 * scale, y: headY - headRadius + 2 * scale))
                    crown.addLine(to: CGPoint(x: headX - 14 * scale, y: headY - headRadius - 12 * scale))
                    crown.addLine(to: CGPoint(x: headX - 6 * scale, y: headY - headRadius - 5 * scale))
                    crown.addLine(to: CGPoint(x: headX, y: headY - headRadius - 14 * scale))
                    crown.addLine(to: CGPoint(x: headX + 6 * scale, y: headY - headRadius - 5 * scale))
                    crown.addLine(to: CGPoint(x: headX + 14 * scale, y: headY - headRadius - 12 * scale))
                    crown.addLine(to: CGPoint(x: headX + 14 * scale, y: headY - headRadius + 2 * scale))
                    crown.closeSubpath()
                    context.fill(crown, with: .color(Color(hex: "#FFD54F")))
                    context.stroke(crown, with: .color(.black), lineWidth: 1.8)

                case .DRIVER_CAP:
                    let cap = CGRect(x: headX - headRadius, y: headY - headRadius - 9 * scale, width: headRadius * 2, height: 10 * scale)
                    context.fill(Path(roundedRect: cap, cornerRadius: 2), with: .color(Color(hex: "#1A237E")))
                    context.stroke(Path(roundedRect: cap, cornerRadius: 2), with: .color(.black), lineWidth: 1.8)

                case .CHEF_HAT:
                    let hat = CGRect(x: headX - headRadius * 0.8, y: headY - headRadius - 14 * scale, width: headRadius * 1.6, height: 15 * scale)
                    context.fill(Path(roundedRect: hat, cornerRadius: 5), with: .color(.white))
                    context.stroke(Path(roundedRect: hat, cornerRadius: 5), with: .color(.black), lineWidth: 1.8)

                case .ATHLETE_HEADBAND:
                    let band = CGRect(x: headX - headRadius, y: headY - headRadius + 2 * scale, width: headRadius * 2, height: 6 * scale)
                    context.fill(Path(band), with: .color(Color(hex: "#E53935")))

                default:
                    break
                }
                return
            }

            switch propStyle {
            case .shopCounter where side == 1:
                let capRect = CGRect(x: headX - headRadius * 0.9, y: headY - headRadius - 8 * scale, width: headRadius * 1.8, height: 10 * scale)
                context.fill(Path(roundedRect: capRect, cornerRadius: 3), with: .color(Color(hex: "#1E88E5")))
                context.stroke(Path(roundedRect: capRect, cornerRadius: 3), with: .color(.black), lineWidth: 2)

            case .interrogation:
                if side == 1 {
                    let capRect = CGRect(x: headX - headRadius, y: headY - headRadius - 10 * scale, width: headRadius * 2, height: 12 * scale)
                    context.fill(Path(roundedRect: capRect, cornerRadius: 3), with: .color(Color(hex: "#263238")))
                    context.stroke(Path(roundedRect: capRect, cornerRadius: 3), with: .color(.black), lineWidth: 2)
                    let badge = CGRect(x: headX - 3 * scale, y: headY - headRadius - 7 * scale, width: 6 * scale, height: 6 * scale)
                    context.fill(Path(ellipseIn: badge), with: .color(Color(hex: "#FFD54F")))
                } else {
                    let g1 = CGRect(x: headX - 13 * scale, y: headY - 9 * scale, width: 11 * scale, height: 7 * scale)
                    let g2 = CGRect(x: headX + 2 * scale, y: headY - 9 * scale, width: 11 * scale, height: 7 * scale)
                    context.fill(Path(g1), with: .color(.black))
                    context.fill(Path(g2), with: .color(.black))
                }

            case .hospital:
                if side == 0 {
                    var band = Path()
                    band.move(to: CGPoint(x: headX - headRadius * 0.85, y: headY - 12 * scale))
                    band.addLine(to: CGPoint(x: headX + headRadius * 0.85, y: headY - 12 * scale))
                    context.stroke(band, with: .color(.black), lineWidth: 2.5 * scale)
                    let mirrorR = 6 * scale
                    let mirrorRect = CGRect(x: headX - mirrorR, y: headY - headRadius - mirrorR * 0.5, width: mirrorR * 2, height: mirrorR * 2)
                    context.fill(Path(ellipseIn: mirrorRect), with: .color(Color(hex: "#E0F7FA")))
                    context.stroke(Path(ellipseIn: mirrorRect), with: .color(.black), lineWidth: 2)
                } else {
                    let bandage = CGRect(x: headX - headRadius, y: headY - headRadius - 2 * scale, width: headRadius * 2, height: 9 * scale)
                    context.fill(Path(roundedRect: bandage, cornerRadius: 3), with: .color(.white))
                    context.stroke(Path(roundedRect: bandage, cornerRadius: 3), with: .color(.black), lineWidth: 1.8)
                }

            case .classroom:
                if side == 1 {
                    var hat = Path()
                    hat.move(to: CGPoint(x: headX, y: headY - headRadius - 12 * scale))
                    hat.addLine(to: CGPoint(x: headX + 24 * scale, y: headY - headRadius - 4 * scale))
                    hat.addLine(to: CGPoint(x: headX, y: headY - headRadius + 2 * scale))
                    hat.addLine(to: CGPoint(x: headX - 24 * scale, y: headY - headRadius - 4 * scale))
                    hat.closeSubpath()
                    context.fill(hat, with: .color(.black))
                } else {
                    let cap = CGRect(x: headX - headRadius * 0.85, y: headY - headRadius - 7 * scale, width: headRadius * 1.7, height: 9 * scale)
                    context.fill(Path(roundedRect: cap, cornerRadius: 4), with: .color(Color(hex: "#E53935")))
                    context.stroke(Path(roundedRect: cap, cornerRadius: 4), with: .color(.black), lineWidth: 1.8)
                }

            case .fantasyHero where side == 0:
                var crown = Path()
                crown.move(to: CGPoint(x: headX - 14 * scale, y: headY - headRadius + 2 * scale))
                crown.addLine(to: CGPoint(x: headX - 14 * scale, y: headY - headRadius - 12 * scale))
                crown.addLine(to: CGPoint(x: headX - 6 * scale, y: headY - headRadius - 5 * scale))
                crown.addLine(to: CGPoint(x: headX, y: headY - headRadius - 14 * scale))
                crown.addLine(to: CGPoint(x: headX + 6 * scale, y: headY - headRadius - 5 * scale))
                crown.addLine(to: CGPoint(x: headX + 14 * scale, y: headY - headRadius - 12 * scale))
                crown.addLine(to: CGPoint(x: headX + 14 * scale, y: headY - headRadius + 2 * scale))
                crown.closeSubpath()
                context.fill(crown, with: .color(Color(hex: "#FFD54F")))
                context.stroke(crown, with: .color(.black), lineWidth: 1.8)

            case .taxiCar where side == 0:
                let cap = CGRect(x: headX - headRadius, y: headY - headRadius - 9 * scale, width: headRadius * 2, height: 10 * scale)
                context.fill(Path(roundedRect: cap, cornerRadius: 2), with: .color(Color(hex: "#1A237E")))
                context.stroke(Path(roundedRect: cap, cornerRadius: 2), with: .color(.black), lineWidth: 1.8)

            default:
                break
            }
        }

        private func drawTsukkomiSpark(context: inout GraphicsContext, x: CGFloat, y: CGFloat, scale: CGFloat, isStrong: Bool) {
            let rInner = 9 * scale
            let rOuter = (isStrong ? 28.0 : 22.0) * scale
            let count = isStrong ? 10 : 8
            let stepDeg = 360.0 / Double(count)

            if isStrong {
                let ringRect = CGRect(x: x - 15 * scale, y: y - 15 * scale, width: 30 * scale, height: 30 * scale)
                context.stroke(Path(ellipseIn: ringRect), with: .color(Color(hex: "#FF3D00")), lineWidth: 3.2 * scale)
            }

            for i in 0..<count {
                let rad = (Double(i) * stepDeg + 18.0) * .pi / 180.0
                let sx = x + CGFloat(cos(rad)) * rInner
                let sy = y + CGFloat(sin(rad)) * rInner
                let ex = x + CGFloat(cos(rad)) * rOuter
                let ey = y + CGFloat(sin(rad)) * rOuter

                var line = Path()
                line.move(to: CGPoint(x: sx, y: sy))
                line.addLine(to: CGPoint(x: ex, y: ey))
                let color = (i % 2 == 1) ? Color(hex: "#D50000") : Color(hex: "#FF6D00")
                context.stroke(
                    line,
                    with: .color(color),
                    style: StrokeStyle(lineWidth: (isStrong ? 5.0 : 4.0) * scale, lineCap: .round)
                )
            }
        }

        private func drawBlackoutOverlay(context: inout GraphicsContext, w: CGFloat, h: CGFloat, alpha: CGFloat) {
            let clamped = min(max(alpha, 0.0), 1.0)
            context.fill(Path(CGRect(x: 0, y: 0, width: w, height: h)), with: .color(Color.black.opacity(clamped)))

            if isFinished && clamped >= 0.90 {
                let txt = Text("")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(Color.white.opacity(0.9))
                context.draw(txt, at: CGPoint(x: w * 0.5, y: h * 0.45))
            }
        }
    }
