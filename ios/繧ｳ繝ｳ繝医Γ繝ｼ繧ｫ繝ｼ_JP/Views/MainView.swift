import SwiftUI
import UIKit

struct MainView: View {

    @State private var setting: String = ""      // シチュエーション・舞台設定
    @State private var genre: String = ""        // コントのテイスト・ジャンル
    @State private var characters: String = ""   // 役柄（ボケ役・ツッコミ役）
    @State private var length: String = ""       // 文字数

    @State private var showCastSheet = false
    @State private var castLeft = "人間の言葉を喋る柴犬"
    @State private var castRight = "常識人なバイト店員"
    @State private var isSuggestingSetting = false
    @State private var presetNotice: String?
    @State private var showTechPanel = false
    @State private var selectedBoke: Set<String> = []
    @State private var selectedTsukkomi: Set<String> = []
    @State private var selectedGeneral: Set<String> = []

    @State private var isGenerating = false
    @State private var progressPercent = 0

    @State private var showResult = false
    @State private var resultTitle = ""
    @State private var resultBody = ""
    @State private var resultStructure: String?
    @State private var resultTechniques: String?
    @State private var resultSceneSetting: String = ""

    @State private var errorMessage: String?

    private let leftCast = ["クセが強すぎる客", "謎の経歴を持つ応募者", "礼儀正しすぎる銀行強盗", "独自の美学を持つカリスマ美容師", "人間の言葉を喋る柴犬", "態度がデカい飼い猫", "やる気ゼロのパンダ", "語彙力が高すぎるゴリラ", "都会に降りてきたクマ", "すぐパニックになるウサギ", "都会に憧れるペンギン", "墨を吐いてごまかすタコ", "地球の常識がズレてる宇宙人", "冷徹で毒舌な冷蔵庫", "充電2%で遺言を語るスマホ", "意識高い系のりんご", "賞味期限ギリギリのおにぎり", "反抗期の信号機", "愚痴っぽい伝説の聖剣", "全てを見てきたトイレ", "ポンコツAIロボット"]
    private let rightCast = ["常識人なバイト店員", "振り回されるベテラン刑事", "冷静にツッコむ医者", "圧倒される面接官", "真面目な担任の先生", "関西弁でツッコむ番犬", "呆れ顔のボス猫", "真面目すぎる皇帝ペンギン", "検索して冷静に論破するスマホ", "全てを冷静に冷やす冷蔵庫", "現実を突きつける焼きおにぎり", "正論しか言わない最新ロボット"]

    var body: some View {
        ZStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {

                    Spacer().frame(height: 4)

                    HStack(spacing: 12) {
                        Text("コント舞台・配役の設定")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundColor(Color(hex: "#075985"))
                        Spacer(minLength: 4)
                        Button {
                            hideKeyboard()
                            Task { await applyRandomPreset() }
                        } label: {
                            HStack(spacing: 4) {
                                if isSuggestingSetting {
                                    ProgressView().tint(Color(hex: "#075985"))
                                } else {
                                    Image(systemName: "dice.fill")
                                }
                                Text(isSuggestingSetting ? "考案中…" : "おまかせ設定")
                            }
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(Color(hex: "#075985"))
                            .padding(.horizontal, 12)
                            .frame(height: 37)
                            .background(Color(hex: "#E0F2FE"))
                            .clipShape(Capsule())
                            .overlay(Capsule().stroke(Color(hex: "#7DD3FC"), lineWidth: 1))
                        }
                        .buttonStyle(.plain)
                        .disabled(isSuggestingSetting || isGenerating)
                        .accessibilityLabel("AIでコントの設定をおまかせ作成")
                    }
                    .padding(.horizontal)

                    if let notice = presetNotice {
                        Text(notice)
                            .font(.caption)
                            .foregroundColor(Color(hex: "#0F766E"))
                            .padding(.horizontal)
                    }

                    // ===== 入力欄 =====
                    if #available(iOS 16.0, *) {
                        TextField("シチュエーション・舞台（例：深夜のコンビニ／取調室）", text: $setting, axis: .vertical)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .padding(.horizontal)
                    } else {
                        TextField("シチュエーション・舞台（例：深夜のコンビニ／取調室）", text: $setting)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .padding(.horizontal)
                    }

                    TextField("ジャンル・作風（例：日常系／シュール／サスペンス風）", text: $genre)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding(.horizontal)

                    HStack {
                        Text("🎭 登場キャラ（動物・物も設定可！）")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(Color(hex: "#1565C0"))
                        Spacer()
                        Button("🐾📦 配役を任命") { showCastSheet = true }
                            .font(.system(size: 13, weight: .bold))
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .background(Color(hex: "#0D9488"))
                            .foregroundColor(.white).cornerRadius(18)
                    }
                    .padding(.horizontal)

                    if #available(iOS 16.0, *) {
                        TextField("役柄設定（例：左のボケ役, 右のツッコミ役）", text: $characters, axis: .vertical)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .padding(.horizontal)
                    } else {
                        TextField("役柄設定（例：左のボケ役, 右のツッコミ役）", text: $characters)
                            .textFieldStyle(RoundedBorderTextFieldStyle())
                            .padding(.horizontal)
                    }

                    TextField("文字数（100〜2000 ※空欄で標準400文字）", text: $length)
                        .keyboardType(.numberPad)
                        .textFieldStyle(RoundedBorderTextFieldStyle())
                        .padding(.horizontal)

                    // ===== コント技法ボタン =====
                    Button(action: {
                        withAnimation {
                            showTechPanel.toggle()
                        }
                    }) {
                        Text(showTechPanel ? "コント技法選択を隠す" : "コント技法選択を表示")
                            .frame(maxWidth: .infinity, minHeight: 48)
                            .background(Color(hex: "#2563EB"))
                            .foregroundColor(.white)
                            .cornerRadius(24)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)

                    // ===== コント技法パネル =====
                    if showTechPanel {
                        ConteTechSelectorView(
                            selectedBoke: $selectedBoke,
                            selectedTsukkomi: $selectedTsukkomi,
                            selectedGeneral: $selectedGeneral
                        )
                    }

                    if let error = errorMessage {
                        Text(error)
                            .foregroundColor(.red)
                            .padding(.horizontal)
                    }

                    // ===== 作成ボタン =====
                    Button(action: {
                        hideKeyboard()
                        Task { await generate() }
                    }) {
                        Text("コントを作成")
                            .font(.system(size: 17, weight: .bold))
                            .frame(maxWidth: .infinity, minHeight: 52)
                            .background(Color(hex: "#2563EB"))
                            .foregroundColor(.white)
                            .cornerRadius(26)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal)
                    .disabled(isGenerating)

                    Text("※出力には60秒ほどかかります。バックグラウンドでも実行されます。")
                        .font(.footnote)
                        .foregroundColor(.gray)
                        .padding(.horizontal)
                        .padding(.top, 4)

                    Spacer().frame(height: 24)
                }
            }

            // ===== 作成中オーバーレイ =====
            if isGenerating {
                ZStack {
                    Color.black.opacity(0.55)
                        .ignoresSafeArea()
                    VStack(spacing: 16) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .scaleEffect(1.4)
                        Text("コント台本を作成中…")
                            .font(.title3)
                            .foregroundColor(.white)
                            .bold()
                        Text("\(progressPercent)%")
                            .font(.title3)
                            .foregroundColor(.white)
                    }
                    .padding(32)
                    .background(Color.black.opacity(0.75))
                    .cornerRadius(16)
                }
            }
        }
        .navigationTitle("コントメーカー")
        .sheet(isPresented: $showCastSheet) {
            NavigationView {
                Form {
                    Section(header: Text("左ステージ：ボケ・仕掛け人")) {
                        Picker("ボケ役", selection: $castLeft) {
                            ForEach(leftCast, id: \.self) { Text($0).tag($0) }
                        }.pickerStyle(.wheel)
                    }
                    Section(header: Text("右ステージ：ツッコミ・巻き込まれ役")) {
                        Picker("ツッコミ役", selection: $castRight) {
                            ForEach(rightCast, id: \.self) { Text($0).tag($0) }
                        }.pickerStyle(.wheel)
                    }
                    Button("🎲 ランダムな組み合わせ") {
                        castLeft = leftCast.randomElement() ?? castLeft
                        castRight = rightCast.randomElement() ?? castRight
                    }
                    Button("この配役で任命する") {
                        characters = "\(castLeft), \(castRight)"
                        if setting.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                            setting = suggestedStage(for: castLeft)
                        }
                        if genre.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { genre = "日常×シュール" }
                        showCastSheet = false
                    }.font(.headline)
                }
                .navigationTitle("コント配役の任命")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { showCastSheet = false } } }
            }
        }
        .sheet(isPresented: $showResult) {
            ResultView(
                title: resultTitle,
                fullText: resultBody,
                sceneSetting: resultSceneSetting,
                initialVoiceMode: VoiceModeStorage.loadVoiceMode(),
                initialSpeed: VoiceModeStorage.loadSpeed(),
                initialPitch: VoiceModeStorage.loadPitch(),
                structureText: resultStructure,
                techniquesText: resultTechniques,
                fromHistory: false
            )
        }

    }

    @MainActor
    private func applyRandomPreset() async {
        guard !isSuggestingSetting else { return }
        isSuggestingSetting = true
        presetNotice = nil
        defer { isSuggestingSetting = false }
        do {
            let preset = try await APIClient.shared.suggestSetting()
            let newTheme = preset.theme.trimmingCharacters(in: .whitespacesAndNewlines)
            let newCharacters = preset.characters.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !newTheme.isEmpty && !newCharacters.isEmpty else {
                throw APIError.httpError(status: 502, message: "AIの設定が空でした")
            }
            setting = newTheme
            genre = preset.genre.isEmpty ? "日常×シュール" : preset.genre
            characters = newCharacters
            presetNotice = "AIがおすすめ設定を考案しました"
        } catch {
            let presets: [(String, String, String)] = [
                ("深夜のコンビニで買い物客が実は店長", "立場逆転", "常識外れの新人店員, 振り回される客"),
                ("取調室の犯人が刑事を取り調べる", "シュール", "自信満々の容疑者, 困惑する刑事"),
                ("患者より病気のことを知らない医者", "すれ違い", "知ったかぶりの医者, 冷静な患者"),
                ("自分が卒業できない担任教師", "学園コント", "卒業したくない先生, 真面目な生徒"),
                ("メニューより人生相談が長いレストラン", "日常×不条理", "相談好きの店員, 空腹の客"),
                ("圧迫面接なのに応募者が面接官を採点", "立場逆転", "面接官を採点する応募者, 弱気な面接官"),
                ("引退後の進路に悩む魔王", "ファンタジー", "転職を考える魔王, 呆れる勇者"),
                ("タクシー運転手が目的地を知らない", "密室コント", "道に迷う運転手, 焦る乗客")
            ]
            if let choice = presets.randomElement() {
                setting = choice.0
                genre = choice.1
                characters = choice.2
            }
            presetNotice = "通信できなかったため、おすすめ設定を入力しました"
        }
    }

    private func suggestedStage(for role: String) -> String {
        if role.contains("冷蔵庫") || role.contains("おにぎり") || role.contains("りんご") { return "真夜中のキッチン" }
        if role.contains("スマホ") { return "持ち主が寝静まった部屋" }
        if role.contains("信号機") { return "深夜のスクランブル交差点" }
        if role.contains("聖剣") { return "魔王城の入り口" }
        if role.contains("トイレ") { return "行列ができる公衆トイレ" }
        if role.contains("タコ") { return "警察の取調室" }
        return "深夜のコンビニ"
    }

    // ===== コント生成処理 =====
    @MainActor
    private func generate() async {
        guard !setting.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            errorMessage = "シチュエーション（舞台設定）を入力してください（「おまかせ設定」も使えます）。"
            return
        }

        let rawLength = length.trimmingCharacters(in: .whitespacesAndNewlines)
        guard rawLength.isEmpty || (Int(rawLength).map { (100...2000).contains($0) } ?? false) else {
            errorMessage = "文字数は100〜2000の範囲で入力してください。"
            return
        }
        let len = Int(rawLength) ?? 400

        isGenerating = true
        progressPercent = 15
        errorMessage = nil

        let progressTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if isGenerating && progressPercent < 35 { progressPercent = 35 }
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if isGenerating && progressPercent < 60 { progressPercent = 60 }
            try? await Task.sleep(nanoseconds: 8_000_000_000)
            if isGenerating && progressPercent < 75 { progressPercent = 75 }
        }

        let userId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"

        // ユーザーが入力した配役を左・右として厳密に確定させる
        let rawCastInput = characters.trimmingCharacters(in: .whitespacesAndNewlines)
        let parsedPair = ConteCastIdentity.parsePair(rawCastInput)
        let leftRoleName = parsedPair.count >= 1 ? parsedPair[0] : (rawCastInput.isEmpty ? "ボケ役" : rawCastInput)
        let rightRoleName = parsedPair.count >= 2 ? parsedPair[1] : "ツッコミ役"
        let explicitCharacters = "左:\(leftRoleName), 右:\(rightRoleName)"

        let conteTheme = "\(setting)（※漫才ではなく、最初から役に入り込んで演じる『コント（寸劇）』として作成。左のボケ役は「\(leftRoleName)」、右のツッコミ役は「\(rightRoleName)」。挨拶や「もういいよ」は入れず、コントのオチのセリフで終えること）"
        let conteGenre = genre.isEmpty ? "コント" : "コント（\(genre)）"

        let payload = GenerateRequestPayload(
            theme: conteTheme,
            genre: conteGenre,
            characters: explicitCharacters,
            length: len,
            boke: selectedBoke.sorted(),
            tsukkomi: selectedTsukkomi.sorted(),
            general: selectedGeneral.sorted(),
            userId: userId
        )

        do {
            let res = try await APIClient.shared.generate(payload: payload)
            progressTask.cancel()
            progressPercent = 90

            resultTitle = res.title.replacingOccurrences(of: "（※.*）", with: "", options: .regularExpression)
            resultBody = cleanConteEnding(res.text)

            // ★ サーバーの effectiveSetting に含まれる古い/誤った LEFT_COSTUME や RIGHT_ROLE を一切使わず、
            // ユーザーが指定した leftRoleName / rightRoleName から直接コスチュームを決定して組み立てる！
            let safeLeft = leftRoleName.replacingOccurrences(of: "|", with: "／").replacingOccurrences(of: "\n", with: " ")
            let safeRight = rightRoleName.replacingOccurrences(of: "|", with: "／").replacingOccurrences(of: "\n", with: " ")

            let resolvedLeftCostume: String = {
                if let c = ConteRoleCostume.inferred(from: safeLeft) { return c.rawValue }
                if let c = ConteRoleCostume.inferredHumanCostume(from: safeLeft) { return c.rawValue }
                if let aiC = res.meta?.leftCostume, !aiC.hasPrefix("ANIMAL_"), !aiC.hasPrefix("OBJECT_") { return aiC }
                return "CASUAL_PLAIN"
            }()

            let resolvedRightCostume: String = {
                if let c = ConteRoleCostume.inferred(from: safeRight) { return c.rawValue }
                if let c = ConteRoleCostume.inferredHumanCostume(from: safeRight) { return c.rawValue }
                if let aiC = res.meta?.rightCostume, !aiC.hasPrefix("ANIMAL_"), !aiC.hasPrefix("OBJECT_") { return aiC }
                return "CASUAL_PLAIN"
            }()

            var stageParts: [String] = [
                setting,
                genre.isEmpty ? "コント" : genre,
                "\(safeLeft), \(safeRight)",
                "CAST_LEFT:\(safeLeft)",
                "CAST_RIGHT:\(safeRight)",
                "LEFT_ROLE:\(safeLeft)",
                "RIGHT_ROLE:\(safeRight)",
                "LEFT_COSTUME:\(resolvedLeftCostume)",
                "RIGHT_COSTUME:\(resolvedRightCostume)"
            ]
            if let st = res.meta?.stageStyle, !st.isEmpty {
                stageParts.append("STAGE:\(st)")
            }

            resultSceneSetting = stageParts.joined(separator: " | ")
            resultStructure = res.meta?.structure?.joined(separator: "、")
            resultTechniques = res.meta?.techniques?.joined(separator: "、")

            progressPercent = 100
            isGenerating = false
            showResult = true

        } catch {
            progressTask.cancel()
            isGenerating = false
            if case APIError.httpError(let status, _) = error, status == 402 {
                errorMessage = "生成サーバーが旧クレジット制限を適用しています。サーバー側の有料アプリ対応が必要です。"
            } else {
                errorMessage = "作成に失敗しました：\(error.localizedDescription)"
            }
        }
    }

    private func cleanConteEnding(_ text: String) -> String {
        var lines = text.components(separatedBy: .newlines)
        while let last = lines.last, last.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            lines.removeLast()
        }
        if lines.count >= 2, let last = lines.last {
            let cleanLast = SpeechManager.stripSpeakerName(from: last)
            if cleanLast == "もういいよ！" || cleanLast == "もういいよ" || cleanLast == "もうええわ！" {
                lines.removeLast()
            }
        }
        return lines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }


}

struct ConteTechSelectorView: View {
    @Binding var selectedBoke: Set<String>
    @Binding var selectedTsukkomi: Set<String>
    @Binding var selectedGeneral: Set<String>

    private let bokeList: [String] = [
        "キャラ憑依ボケ",
        "状況ズレボケ",
        "小道具・マイムボケ",
        "専門用語・独自ルール",
        "狂気・サイコパス風",
        "天丼（繰り返しボケ）",
        "棒読み・カタコト"
    ]

    private let tsukkomiList: [String] = [
        "困惑・戸惑いツッコミ",
        "呆れ・冷静ツッコミ",
        "キレ芸・絶叫ツッコミ",
        "小声・心の声ツッコミ",
        "ノリツッコミ"
    ]

    private let generalList: [String] = [
        "立場逆転",
        "緊張と緩和",
        "伏線回収オチ",
        "エスカレート構成",
        "すれ違いコント",
        "展開破壊（シュール）"
    ]

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("■ コント技法選択（複数選択可）")
                .font(.headline)
                .padding(.top, 8)

            Text("ボケ（役柄・行動）")
                .font(.subheadline)
                .bold()
            chipGrid(options: bokeList, selection: $selectedBoke)

            Text("ツッコミ（リアクション）")
                .font(.subheadline)
                .bold()
                .padding(.top, 8)
            chipGrid(options: tsukkomiList, selection: $selectedTsukkomi)

            Text("コント構成（展開・オチ）")
                .font(.subheadline)
                .bold()
                .padding(.top, 8)
            chipGrid(options: generalList, selection: $selectedGeneral)
        }
        .padding(.horizontal)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private func chipGrid(options: [String], selection: Binding<Set<String>>) -> some View {
        let columns = [GridItem(.adaptive(minimum: 130), spacing: 8)]
        LazyVGrid(columns: columns, alignment: .center, spacing: 8) {
            ForEach(options, id: \.self) { item in
                let isSelected = selection.wrappedValue.contains(item)
                Button {
                    if isSelected {
                        selection.wrappedValue.remove(item)
                    } else {
                        selection.wrappedValue.insert(item)
                    }
                } label: {
                    Text(item)
                        .font(.system(size: 13, weight: isSelected ? .bold : .regular))
                        .foregroundColor(isSelected ? Color.white : Color(hex: "#334155"))
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(minWidth: 0, maxWidth: .infinity)
                        .background(
                            isSelected
                            ? Color(hex: "#0D9488")
                            : Color(hex: "#E0F2FE")
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 20)
                                .stroke(Color(hex: "#0D9488"), lineWidth: 1)
                        )
                        .cornerRadius(20)
                        .contentShape(Rectangle())
                }
                .buttonStyle(ChipButtonStyle())
            }
        }
    }
}

struct ChipButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Color.black.opacity(configuration.isPressed ? 0.15 : 0.0))
            )
    }
}

extension View {
    func hideKeyboard() {
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
    }
}
