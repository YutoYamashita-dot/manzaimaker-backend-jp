import SwiftUI
import UIKit

struct ResultView: View {
    let title: String
    let fullText: String
    let sceneSetting: String
    let structureText: String?
    let techniquesText: String?
    let fromHistory: Bool

    @State private var voiceMode: VoiceMode
    @State private var speed: Float
    @State private var pitch: Float
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var speechManager = SpeechManager.shared

    @State private var showMetaPanel = false
    @State private var showHistorySheet = false
    @State private var showSavedToast = false
    @State private var showTtsSavedToast = false
    @State private var showPerformanceDialog = false
    @State private var isAlreadySaved: Bool = false

    private var cleanDisplayText: String {
        SpeechManager.stripActionTags(from: fullText)
    }

    private var charCount: Int {
        cleanDisplayText.count
    }

    private func speakerId(for line: String) -> String? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if let range = trimmed.range(of: "：") ?? trimmed.range(of: ":") {
            let name = trimmed[..<range.lowerBound].trimmingCharacters(in: .whitespaces)
            return name.isEmpty ? nil : String(name)
        }
        return nil
    }

    private func isTitleLike(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return false }
        func normalizeTitle(_ s: String) -> String {
            return s
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .replacingOccurrences(of: "^【|】$", with: "", options: .regularExpression)
                .replacingOccurrences(of: "^(タイトル|Title)[:：]\\s*", with: "", options: .regularExpression)
        }
        let normGlobalTitle = normalizeTitle(title)
        let normLine = normalizeTitle(trimmed)
        if !normGlobalTitle.isEmpty && !normLine.isEmpty && normGlobalTitle == normLine {
            return true
        }
        if trimmed.hasPrefix("【"), trimmed.hasSuffix("】") { return true }
        if trimmed.hasPrefix("#") { return true }
        if trimmed.range(of: "^(タイトル|Title)[:：]", options: .regularExpression) != nil { return true }
        return false
    }

    private var displayTurns: [(speaker: String?, text: String)] {
        let rawLines = cleanDisplayText.components(separatedBy: .newlines)
        var result: [(String?, String)] = []
        var currentSpeaker: String? = nil
        var currentText: String = ""
        for raw in rawLines {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty { continue }
            if isTitleLike(line) { continue }
            if line.range(of: #"^(?:STAGE|LEFT_COSTUME|RIGHT_COSTUME|CAST_LEFT|CAST_RIGHT|LEFT_ROLE|RIGHT_ROLE|構成|技法|設定|文字数)\s*[:：]"#, options: [.regularExpression, .caseInsensitive]) != nil { continue }
            let sp = speakerId(for: line)
            if let sp = sp {
                if !currentText.isEmpty {
                    result.append((currentSpeaker, currentText))
                }
                currentSpeaker = sp
                currentText = line
            } else {
                if currentText.isEmpty {
                    currentText = line
                } else {
                    currentText += " " + line
                }
            }
        }
        if !currentText.isEmpty {
            result.append((currentSpeaker, currentText))
        }
        return result
    }

    init(title: String,
         fullText: String,
         sceneSetting: String = "",
         initialVoiceMode: VoiceMode,
         initialSpeed: Float,
         initialPitch: Float,
         structureText: String? = nil,
         techniquesText: String? = nil,
         fromHistory: Bool = false) {
        self.title = title
        self.fullText = fullText
        self.sceneSetting = sceneSetting
        self._voiceMode = State(initialValue: initialVoiceMode)
        self._speed = State(initialValue: initialSpeed)
        self._pitch = State(initialValue: initialPitch)
        self.structureText = structureText
        self.techniquesText = techniquesText
        self.fromHistory = fromHistory
        self._isAlreadySaved = State(initialValue: fromHistory)
    }

    var body: some View {
        NavigationView {
            ZStack {
                Color(hex: "#F1F5F9")
                    .ignoresSafeArea()

                ScrollViewReader { scrollProxy in
                    ScrollView {
                        VStack(spacing: 20) {
                            // タイトルカード
                            VStack(spacing: 4) {
                                Text("コント『\(title.isEmpty ? "無題" : title)』")
                                    .font(.system(size: 21, weight: .bold))
                                    .foregroundColor(.black)
                                    .multilineTextAlignment(.center)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .frame(maxWidth: .infinity)
                            .background(
                                RoundedRectangle(cornerRadius: 16)
                                    .fill(Color.white)
                                    .shadow(color: .black.opacity(0.10), radius: 8, x: 0, y: 2)
                            )
                            .padding(.horizontal, 16)
                            .padding(.top, 8)

                            // 本文カード
                            VStack(alignment: .leading, spacing: 8) {
                                let currentSentence = speechManager.currentLineText
                                ForEach(displayTurns.indices, id: \.self) { idx in
                                    let turn = displayTurns[idx]
                                    if idx > 0 {
                                        Text("").padding(.vertical, 2)
                                    }
                                    let turnText = turn.text
                                    let isHighlighted: Bool = {
                                        guard let current = currentSentence, !current.isEmpty else { return false }
                                        return turnText.contains(current) || current.contains(turnText)
                                    }()

                                    let highlightColor = (speechManager.currentSpeakerIndex == 0)
                                        ? Color(hex: "#FFF59D")
                                        : Color(hex: "#C8E6C9")

                                    Text(turnText)
                                        .font(.system(size: 16, weight: isHighlighted ? .bold : .regular))
                                        .foregroundColor(.black)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, 4)
                                        .padding(.horizontal, 4)
                                        .background(
                                            RoundedRectangle(cornerRadius: 6)
                                                .fill(isHighlighted ? highlightColor : Color.clear)
                                        )
                                        .id("turn_\(idx)")
                                }

                                Text("文字数：\(charCount)文字")
                                    .font(.caption)
                                    .foregroundColor(.gray)
                                    .padding(.top, 6)
                            }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 14)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(Color.white)
                                    .shadow(color: .black.opacity(0.08), radius: 6, x: 0, y: 2)
                            )
                            .padding(.horizontal, 16)
                            .onChange(of: speechManager.currentLineText) { newLine in
                                guard let current = newLine, !current.isEmpty else { return }
                                if let hitIdx = displayTurns.firstIndex(where: { $0.text.contains(current) || current.contains($0.text) }) {
                                    withAnimation(.easeInOut(duration: 0.3)) {
                                        scrollProxy.scrollTo("turn_\(hitIdx)", anchor: .center)
                                    }
                                }
                            }

                            // 保存 / コピー / 共有 / 履歴
                            HStack(spacing: 10) {
                                smallOrangeButton(isAlreadySaved ? "保存済" : "保存", disabled: isAlreadySaved) {
                                    guard !isAlreadySaved else { return }
                                    HistoryManager.shared.add(title: title, body: fullText, sceneSetting: sceneSetting)
                                    isAlreadySaved = true
                                    showSavedToast = true
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                                        showSavedToast = false
                                    }
                                }
                                smallOrangeButton("コピー") {
                                    UIPasteboard.general.string = cleanDisplayText
                                }
                                smallOrangeButton("共有") {
                                    shareText(cleanDisplayText)
                                }
                                smallOrangeButton("履歴") {
                                    showHistorySheet = true
                                }
                            }
                            .padding(.horizontal, 16)

                            // コント上演ボタン
                            Button {
                                speechManager.stop()
                                showPerformanceDialog = true
                            } label: {
                                Text("コントを上演")
                                    .font(.system(size: 18, weight: .bold))
                                    .frame(maxWidth: .infinity, minHeight: 52)
                                    .background(Color(hex: "#1D4ED8"))
                                    .foregroundColor(.white)
                                    .cornerRadius(26)
                            }
                            .buttonStyle(.plain)
                            .padding(.horizontal, 20)

                            // TTSコントロール
                            VStack(alignment: .leading, spacing: 12) {
                                Text("音声プリセット")
                                    .font(.subheadline)
                                    .foregroundColor(.black)
                                HStack(spacing: 16) {
                                    voiceModeChip(.male, label: "男性")
                                    voiceModeChip(.female, label: "女性")
                                }
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("話速").foregroundColor(.black)
                                    Slider(
                                        value: Binding(
                                            get: { Double(speed) },
                                            set: { newVal in
                                                speed = Float(newVal)
                                                restartSpeechIfNeeded()
                                            }
                                        ),
                                        in: 0.3...1.0
                                    )
                                    .tint(.black)
                                }
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("ピッチ").foregroundColor(.black)
                                    Slider(
                                        value: Binding(
                                            get: { Double(pitch) },
                                            set: { newVal in
                                                pitch = Float(newVal)
                                                restartSpeechIfNeeded()
                                            }
                                        ),
                                        in: 0.5...1.5
                                    )
                                    .tint(.black)
                                }
                                HStack(spacing: 10) {
                                    smallOrangeButton("設定を保存") {
                                        VoiceModeStorage.save(mode: voiceMode, speed: speed, pitch: pitch)
                                        showTtsSavedToast = true
                                        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                                            showTtsSavedToast = false
                                        }
                                    }
                                    smallOrangeButton("リセット") {
                                        let def: VoiceMode = .male
                                        voiceMode = def
                                        speed = def.defaultSpeed
                                        pitch = def.defaultPitch
                                        restartSpeechIfNeeded()
                                    }
                                }
                                HStack(spacing: 10) {
                                    smallOrangeButton("読み上げ") {
                                        configureSpeechManager()
                                        speechManager.start()
                                    }
                                    smallOrangeButton("一時停止") {
                                        speechManager.pause()
                                    }
                                    smallOrangeButton("再開") {
                                        speechManager.resume()
                                    }
                                }
                            }
                            .padding(.horizontal, 16)
                            Spacer().frame(height: 16)
                        }
                    }
                }

                if showSavedToast {
                    toastView(text: "履歴に保存しました")
                }
                if showTtsSavedToast {
                    toastView(text: "読み上げ設定を保存しました")
                }
            }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("戻る") { dismiss() }
                }
            }
            .sheet(isPresented: $showHistorySheet) {
                NavigationView {
                    HistoryView()
                }
            }
            .sheet(isPresented: $showPerformanceDialog) {
                ManzaiPerformanceDialogView(
                    title: title.isEmpty ? "無題" : title,
                    script: fullText,
                    sceneSetting: sceneSetting.isEmpty ? title : sceneSetting,
                    voiceMode: voiceMode,
                    speed: speed,
                    pitch: pitch
                )
            }
            .onAppear {
                configureSpeechManager()
            }
            .onDisappear {
                speechManager.stop()
            }
        }
    }

    private func configureSpeechManager() {
        let roles = ConteCastIdentity.roles(from: sceneSetting)
        SpeechManager.shared.configure(
            text: fullText,
            voiceMode: voiceMode,
            speed: speed,
            pitch: pitch,
            includeStageGreetings: false,
            castRoles: roles
        )
    }

    private func smallOrangeButton(_ text: String, disabled: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.system(size: 14, weight: .medium))
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(disabled ? Color.gray.opacity(0.5) : Color(hex: "#2563EB"))
                .foregroundColor(.white)
                .cornerRadius(20)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
    }

    private func voiceModeChip(_ mode: VoiceMode, label: String) -> some View {
        let isSelected = (voiceMode == mode)
        return Button {
            voiceMode = mode
            restartSpeechIfNeeded()
        } label: {
            HStack(spacing: 6) {
                Circle()
                    .stroke(isSelected ? Color(hex: "#2563EB") : Color.gray, lineWidth: 2)
                    .background(Circle().fill(isSelected ? Color(hex: "#2563EB") : Color.clear))
                    .frame(width: 18, height: 18)
                Text(label)
                    .font(.system(size: 14))
                    .foregroundColor(.black)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.8))
            .cornerRadius(18)
        }
        .buttonStyle(.plain)
    }

    private func restartSpeechIfNeeded() {
        if speechManager.isSpeaking {
            configureSpeechManager()
            speechManager.start()
        }
    }

    private func shareText(_ text: String) {
        let av = UIActivityViewController(activityItems: [text], applicationActivities: nil)
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController ?? scene.windows.first?.rootViewController else {
            return
        }
        var topController = root
        while let presented = topController.presentedViewController {
            topController = presented
        }
        if let pop = av.popoverPresentationController {
            pop.sourceView = topController.view
            pop.sourceRect = CGRect(x: topController.view.bounds.midX, y: topController.view.bounds.midY, width: 0, height: 0)
            pop.permittedArrowDirections = []
        }
        topController.present(av, animated: true)
    }

    @ViewBuilder
    private func toastView(text: String) -> some View {
        VStack {
            Spacer()
            Text(text)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(Color.black.opacity(0.8))
                .foregroundColor(.white)
                .cornerRadius(8)
                .padding(.bottom, 40)
        }
        .transition(.opacity)
    }
}
