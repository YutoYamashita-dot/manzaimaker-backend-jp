import SwiftUI
import UIKit
import AVFoundation
import Combine

struct ManzaiPerformanceDialogView: View {
    let title: String
    let script: String
    var sceneSetting: String = ""
    let voiceMode: VoiceMode
    let speed: Float
    let pitch: Float

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var speechManager = SpeechManager.shared

    @State private var animTick: Int = 0
    @State private var slapTick: Int = 100
    @State private var lastTriggeredLineText: String = ""

    @State private var blackoutAlpha: CGFloat = 1.0
    @State private var isIntroLightsUp: Bool = true
    @State private var isEndingBlackout: Bool = false
    @State private var isFinished: Bool = false
    @State private var isPausedByUser: Bool = false

    private let frameTimer = Timer.publish(every: 0.035, on: .main, in: .common).autoconnect()

    private var stageMetadata: String { "\(sceneSetting)\n\(script)" }

    /// 常に最新の配役ペア（0: 左, 1: 右）を返す
    private var roleDescriptions: [String] {
        let fromSetting = ConteCastIdentity.roles(from: sceneSetting)
        if fromSetting.count == 2 { return fromSetting }
        let fromScript = SpeechManager.extractScriptSpeakerNames(from: script)
        if fromScript.count >= 2 { return Array(fromScript.prefix(2)) }
        return fromSetting
    }

    /// 該当サイド（0:左, 1:右）のコスチュームを決定する。
    /// ユーザーが指定した配役文字列（roleDescriptions[side]）を絶対の基準とし、
    /// AIが誤って逆に出力した LEFT_COSTUME / RIGHT_COSTUME は採用しない。
    private func resolvedCostume(for side: Int) -> ConteRoleCostume? {
        if roleDescriptions.indices.contains(side) {
            let role = roleDescriptions[side]
            if let nonhuman = ConteRoleCostume.inferred(from: role) {
                return nonhuman
            }
            if let human = ConteRoleCostume.inferredHumanCostume(from: role) {
                return human
            }
            // 配役名に動物・物の名前が含まれていないなら人間（棒人間）として描画する
            return .CASUAL_PLAIN
        }

        // 配役リスト自体が取得できない古い履歴データの場合のみ、SpeechManagerの解析結果から取得
        let turns = SpeechManager.buildExpressiveTurns(from: script, includeStageGreetings: false, castRoles: roleDescriptions)
        if let turnForSide = turns.first(where: { $0.speakerSide == side }) {
            let spkName = String(turnForSide.displayLine.prefix(while: { $0 != ":" && $0 != "：" }))
            if let nonhuman = ConteRoleCostume.inferred(from: spkName) {
                return nonhuman
            }
            if let human = ConteRoleCostume.inferredHumanCostume(from: spkName) {
                return human
            }
        }

        let key = side == 0 ? "LEFT_COSTUME" : "RIGHT_COSTUME"
        return ConteRoleCostume.extract(key, from: stageMetadata)
    }

    private var detectedLeftCostume: ConteRoleCostume? { resolvedCostume(for: 0) }
    private var detectedRightCostume: ConteRoleCostume? { resolvedCostume(for: 1) }

    private var detectedPropStyle: ContePropStyle {
        ContePropStyle.detect(from: "\(sceneSetting) \(title) \(script)")
    }

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()

            VStack(spacing: 0) {
                // 1. 上部タイトルバー
                HStack {
                    Text(headerTitleText)
                        .font(.system(size: 17, weight: .bold))
                        .foregroundColor(.black)
                        .lineLimit(1)
                    Spacer()
                    Button {
                        stopAllPerformance()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 26))
                            .foregroundColor(.gray.opacity(0.8))
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .background(Color.white)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(Color.black.opacity(0.1)),
                    alignment: .bottom
                )

                // 2. ステージ＆字幕の統合コンテナ
                GeometryReader { geo in
                    let floorY = geo.size.height * StageCanvasView.floorRatio

                    ZStack(alignment: .top) {
                        StageCanvasView(
                            activeSpeaker: currentActiveSpeaker,
                            action: currentStageAction,
                            animTick: animTick,
                            slapTick: slapTick,
                            blackoutAlpha: blackoutAlpha,
                            isFinished: isFinished,
                            propStyle: detectedPropStyle,
                            voiceMode: voiceMode,
                            leftCostume: detectedLeftCostume,
                            rightCostume: detectedRightCostume
                        )
                        .frame(width: geo.size.width, height: geo.size.height)

                        if isFinished {
                            Text("終演")
                                .font(.system(size: 38, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                                .tracking(7)
                                .shadow(color: .white.opacity(0.4), radius: 10)
                                .frame(width: geo.size.width, height: geo.size.height)
                                .transition(.opacity)
                        }

                        if blackoutAlpha < 0.25, let sub = currentSubtitleText, !sub.isEmpty {
                            Text(sub)
                                .font(.system(size: subtitleFontSize(for: sub), weight: .semibold))
                                .foregroundColor(.black)
                                .multilineTextAlignment(.center)
                                .lineLimit(4)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(currentSubtitleBackgroundColor)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10)
                                        .stroke(Color.black.opacity(0.25), lineWidth: 1.5)
                                )
                                .padding(.horizontal, 14)
                                .padding(.top, floorY + 8)
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .clipped()
                .contentShape(Rectangle())
                .onTapGesture {
                    handleStageTap()
                }

                // 3. 下部コントロールバー
                HStack {
                    Button {
                        handleStageTap()
                    } label: {
                        Text(controlButtonTitle)
                            .font(.system(size: 15, weight: .bold))
                            .padding(.horizontal, 20)
                            .padding(.vertical, 10)
                            .background(Color(hex: "#2563EB"))
                            .foregroundColor(.white)
                            .cornerRadius(20)
                    }

                    Spacer()

                    Button("閉じる") {
                        stopAllPerformance()
                        dismiss()
                    }
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(.black.opacity(0.8))
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 14)
                .background(Color.white)
                .overlay(
                    Rectangle()
                        .frame(height: 1)
                        .foregroundColor(Color.black.opacity(0.1)),
                    alignment: .top
                )
            }
            .background(Color.white)
        }
        .onAppear {
            UIApplication.shared.isIdleTimerDisabled = true
            startConteLightsUpSequence()
        }
        .onDisappear {
            stopAllPerformance()
            UIApplication.shared.isIdleTimerDisabled = false
        }
        .onReceive(frameTimer) { _ in
            guard !isPausedByUser else { return }
            animTick += 1
            if slapTick < 100 {
                slapTick += 1
            }

            if isIntroLightsUp {
                if blackoutAlpha > 0.0 {
                    blackoutAlpha = max(blackoutAlpha - 0.055, 0.0)
                } else {
                    isIntroLightsUp = false
                    animTick = 0
                    speechManager.start()
                }
            }

            if isEndingBlackout {
                if blackoutAlpha < 1.0 {
                    blackoutAlpha = min(blackoutAlpha + 0.05, 1.0)
                } else {
                    isEndingBlackout = false
                    isFinished = true
                }
            }
        }
        .onChange(of: speechManager.currentLineText) { newLine in
            guard let line = newLine, !line.isEmpty, line != lastTriggeredLineText else { return }
            lastTriggeredLineText = line
            animTick = 0

            let act = speechManager.currentAction
            switch act {
            case .tsukkomiSlap:
                slapTick = 0
                ConteSoundEngineIOS.shared.playTsukkomiSlap(strong: true)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.65) {
                    if speechManager.isSpeaking {
                        ConteSoundEngineIOS.shared.playAudienceLaugh(big: true)
                    }
                }
            case .tsukkomiPoint:
                slapTick = 0
                ConteSoundEngineIOS.shared.playTsukkomiSlap(strong: false)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.60) {
                    if speechManager.isSpeaking {
                        ConteSoundEngineIOS.shared.playAudienceLaugh(big: false)
                    }
                }
            case .zukoke:
                slapTick = 100
                ConteSoundEngineIOS.shared.playZukokeSlideAndThud()
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.55) {
                    if speechManager.isSpeaking {
                        ConteSoundEngineIOS.shared.playAudienceLaugh(big: true)
                    }
                }
            case .dogeza:
                slapTick = 100
                ConteSoundEngineIOS.shared.playTsukkomiSlap(strong: false)
            case .stepClose:
                slapTick = 100
                ConteSoundEngineIOS.shared.playDramaticSuspenseChord()
            case .poseCool:
                slapTick = 100
                ConteSoundEngineIOS.shared.playCoolPoseSparkle()
            default:
                slapTick = 100
            }
        }
        .onChange(of: speechManager.isSpeaking) { speaking in
            if !speaking && !isIntroLightsUp && !isEndingBlackout && !isPausedByUser && !isFinished {
                startConteBlackoutSequence()
            }
        }
    }

    // MARK: - 表示状態の計算

    private var headerTitleText: String {
        let base = title.isEmpty ? "無題" : "コント『\(title)』"
        if isPausedByUser {
            return "⏸ 一時停止中（タップで再開）"
        } else if isFinished {
            return "\(base)（タップで再演）"
        }
        return base
    }

    private var controlButtonTitle: String {
        if isFinished { return "もう一度上演" }
        if isPausedByUser { return "再開" }
        return "一時停止"
    }

    private var currentActiveSpeaker: Int? {
        if isIntroLightsUp || isEndingBlackout { return nil }
        return (speechManager.isSpeaking && speechManager.isActivelyVoicing) ? speechManager.currentSpeakerIndex : nil
    }

    private var currentStageAction: ManzaiActionType {
        return speechManager.isSpeaking ? speechManager.currentAction : .normalTalk
    }

    private var currentSubtitleText: String? {
        guard let line = speechManager.currentLineText else { return nil }
        return SpeechManager.stripSpeakerName(from: line)
    }

    private var currentSubtitleBackgroundColor: Color {
        return (speechManager.currentSpeakerIndex == 0)
            ? Color(hex: "#FFF176")
            : Color(hex: "#81C784")
    }

    private func subtitleFontSize(for text: String) -> CGFloat {
        if text.count > 52 { return 13.0 }
        if text.count > 34 { return 14.0 }
        return 15.5
    }

    // MARK: - コント進行シーケンス

    private func startConteLightsUpSequence() {
        speechManager.stop()
        ConteSoundEngineIOS.shared.stopAll()

        isPausedByUser = false
        isIntroLightsUp = true
        isEndingBlackout = false
        isFinished = false
        blackoutAlpha = 1.0
        animTick = 0
        slapTick = 100
        lastTriggeredLineText = ""

        speechManager.configure(
            text: script,
            voiceMode: voiceMode,
            speed: speed,
            pitch: pitch,
            includeStageGreetings: false,
            castRoles: roleDescriptions
        )

        if detectedPropStyle == .shopCounter {
            ConteSoundEngineIOS.shared.playConvenienceStoreChime()
        } else {
            ConteSoundEngineIOS.shared.playLightsUpChime()
        }
    }

    private func startConteBlackoutSequence() {
        isEndingBlackout = true
        animTick = 0
        ConteSoundEngineIOS.shared.playBlackoutStingAndApplause(durationSec: 2.0)
    }

    private func handleStageTap() {
        if isFinished {
            startConteLightsUpSequence()
            return
        }
        if isIntroLightsUp || isEndingBlackout { return }

        if isPausedByUser {
            isPausedByUser = false
            speechManager.resume()
        } else {
            isPausedByUser = true
            ConteSoundEngineIOS.shared.stopAll()
            speechManager.pause()
        }
    }

    private func stopAllPerformance() {
        isIntroLightsUp = false
        isEndingBlackout = false
        ConteSoundEngineIOS.shared.stopAll()
        speechManager.stop()
    }
}

// =========================================================================
// ★ コント専用サウンドエンジン
// =========================================================================
final class ConteSoundEngineIOS {
    static let shared = ConteSoundEngineIOS()
    private let sampleRate = 22050
    private var players: [AVAudioPlayer] = []

    private init() {}

    func stopAll() {
        for p in players { p.stop() }
        players.removeAll()
    }

    func playConvenienceStoreChime() {
        DispatchQueue.global(qos: .userInitiated).async {
            let notes: [Double] = [739.99, 587.33, 440.00, 587.33, 659.25, 880.00]
            let durationSec = 0.90
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)
            let noteLen = max(totalSamples / notes.count, 1)

            for i in 0..<totalSamples {
                let t = Double(i) / Double(self.sampleRate)
                let idx = min(i / noteLen, notes.count - 1)
                let localP = Double(i % noteLen) / Double(noteLen)
                let env = exp(-localP * 3.2)
                let wave = sin(2.0 * .pi * notes[idx] * t) * env * 0.25
                pcm[i] = Int16(min(max(wave, -1.0), 1.0) * Double(Int16.max))
            }
            self.playWav(from: pcm)
        }
    }

    func playLightsUpChime() {
        DispatchQueue.global(qos: .userInitiated).async {
            let durationSec = 0.65
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)
            let freqs: [Double] = [523.25, 659.25, 783.99, 1046.50]

            for i in 0..<totalSamples {
                let t = Double(i) / Double(self.sampleRate)
                let p = Double(i) / Double(totalSamples)
                let env = exp(-p * 5.0)
                var wave = 0.0
                for f in freqs { wave += sin(2.0 * .pi * f * t) }
                let sample = min(max((wave / Double(freqs.count)) * env * 0.28, -1.0), 1.0)
                pcm[i] = Int16(sample * Double(Int16.max))
            }
            self.playWav(from: pcm)
        }
    }

    func playZukokeSlideAndThud() {
        DispatchQueue.global(qos: .userInitiated).async {
            let durationSec = 0.38
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)

            for i in 0..<totalSamples {
                let p = Double(i) / Double(totalSamples)
                let t = Double(i) / Double(self.sampleRate)
                if p < 0.65 {
                    let freq = 950.0 - 650.0 * (p / 0.65)
                    let wave = sin(2.0 * .pi * freq * t) * 0.28
                    pcm[i] = Int16(wave * Double(Int16.max))
                } else {
                    let localP = (p - 0.65) / 0.35
                    let env = exp(-localP * 10.0)
                    let thud = (sin(2.0 * .pi * 110.0 * t) * 0.6 + Double.random(in: -0.4...0.4)) * env * 0.45
                    pcm[i] = Int16(min(max(thud, -1.0), 1.0) * Double(Int16.max))
                }
            }
            self.playWav(from: pcm)
        }
    }

    func playDramaticSuspenseChord() {
        DispatchQueue.global(qos: .userInitiated).async {
            let durationSec = 0.45
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)
            let freqs: [Double] = [146.83, 174.61, 207.65, 293.66]

            for i in 0..<totalSamples {
                let t = Double(i) / Double(self.sampleRate)
                let p = Double(i) / Double(totalSamples)
                let env = exp(-p * 6.0)
                var wave = 0.0
                for f in freqs { wave += sin(2.0 * .pi * f * t) }
                let sample = min(max((wave / Double(freqs.count)) * env * 0.32, -1.0), 1.0)
                pcm[i] = Int16(sample * Double(Int16.max))
            }
            self.playWav(from: pcm)
        }
    }

    func playCoolPoseSparkle() {
        DispatchQueue.global(qos: .userInitiated).async {
            let durationSec = 0.35
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)
            let freqs: [Double] = [1318.5, 1760.0, 2637.0]

            for i in 0..<totalSamples {
                let t = Double(i) / Double(self.sampleRate)
                let p = Double(i) / Double(totalSamples)
                let env = exp(-p * 7.5)
                var wave = 0.0
                for f in freqs { wave += sin(2.0 * .pi * f * t) }
                let sample = min(max((wave / Double(freqs.count)) * env * 0.22, -1.0), 1.0)
                pcm[i] = Int16(sample * Double(Int16.max))
            }
            self.playWav(from: pcm)
        }
    }

    func playTsukkomiSlap(strong: Bool) {
        DispatchQueue.global(qos: .userInitiated).async {
            let durationSec = strong ? 0.12 : 0.095
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)
            let gain = strong ? 0.55 : 0.40

            for i in 0..<totalSamples {
                let p = Double(i) / Double(totalSamples)
                let t = Double(i) / Double(self.sampleRate)
                let env = exp(-p * 19.0)
                let noise = Double.random(in: -1.0...1.0)
                let tone = sin(2.0 * .pi * 360.0 * t)
                let sample = min(max((noise * 0.78 + tone * 0.22) * env * gain, -1.0), 1.0)
                pcm[i] = Int16(sample * Double(Int16.max))
            }
            self.playWav(from: pcm)
        }
    }

    func playAudienceLaugh(big: Bool) {
        DispatchQueue.global(qos: .userInitiated).async {
            let durationSec = big ? 0.80 : 0.50
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)
            let voiceCount = big ? 7 : 4
            let voices = (0..<voiceCount).map { _ in
                (start: Int.random(in: 0..<Int(Double(totalSamples) * 0.22)),
                 freq: Double.random(in: 170.0...300.0),
                 rate: Double.random(in: 4.6...6.0))
            }

            var lp = 0.0
            for i in 0..<totalSamples {
                let prog = Double(i) / Double(totalSamples)
                let masterEnv = sin(.pi * prog) * exp(-prog * 1.4)
                var sum = 0.0
                for v in voices where i >= v.start {
                    let vt = Double(i - v.start) / Double(self.sampleRate)
                    let burst = max(sin(.pi * vt * v.rate), 0.0)
                    let f0 = v.freq * (1.0 - 0.12 * ((vt * v.rate).truncatingRemainder(dividingBy: 1.0)))
                    let wave = sin(2.0 * .pi * f0 * vt) * 0.6 + sin(2.0 * .pi * f0 * 2.0 * vt) * 0.4
                    sum += wave * burst * burst
                }
                let white = Double.random(in: -1.0...1.0)
                lp = lp * 0.82 + white * 0.18
                let scale = big ? 0.15 : 0.09
                let sample = min(max(((sum / Double(voiceCount)) * 0.75 + lp * 0.25) * masterEnv * scale, -1.0), 1.0)
                pcm[i] = Int16(sample * Double(Int16.max))
            }
            self.playWav(from: pcm)
        }
    }

    func playEndingApplause(durationSec: Double) {
        playBlackoutStingAndApplause(durationSec: durationSec)
    }

    func playBlackoutStingAndApplause(durationSec: Double) {
        DispatchQueue.global(qos: .userInitiated).async {
            let totalSamples = Int(durationSec * Double(self.sampleRate))
            var pcm = [Int16](repeating: 0, count: totalSamples)
            let clapTimes = (0..<95).map { _ in Int.random(in: 0..<max(totalSamples - 1000, 1)) }
            let chordFreqs: [Double] = [261.63, 329.63, 392.00, 523.25]

            var lp = 0.0
            for i in 0..<totalSamples {
                let t = Double(i) / Double(self.sampleRate)
                let prog = Double(i) / Double(totalSamples)

                let stingEnv = exp(-prog * 8.5)
                var sting = 0.0
                for f in chordFreqs { sting += sin(2.0 * .pi * f * t) }
                sting = (sting / Double(chordFreqs.count)) * stingEnv * 0.35

                let env = prog < 0.10 ? (prog / 0.10) : (prog > 0.70 ? max((1.0 - prog) / 0.30, 0.0) : 1.0)
                var amp = 0.0
                for ct in clapTimes {
                    let d = i - ct
                    if d >= 0 && d <= 900 { amp += exp(-Double(d) / 210.0) }
                }
                let white = Double.random(in: -1.0...1.0)
                lp = lp * 0.70 + white * 0.30
                let applause = (white - lp) * min(amp, 3.0) * 0.15 * env

                let sample = min(max(sting + applause, -1.0), 1.0)
                pcm[i] = Int16(sample * Double(Int16.max))
            }
            self.playWav(from: pcm)
        }
    }

    private func playWav(from pcm: [Int16]) {
        guard !pcm.isEmpty else { return }
        let dataSize = UInt32(pcm.count * 2)
        let fileSize = 36 + dataSize
        var header = Data()

        header.append("RIFF".data(using: .ascii)!)
        header.append(withUnsafeBytes(of: fileSize.littleEndian) { Data($0) })
        header.append("WAVEfmt ".data(using: .ascii)!)
        header.append(withUnsafeBytes(of: UInt32(16).littleEndian) { Data($0) })
        header.append(withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) })
        header.append(withUnsafeBytes(of: UInt16(1).littleEndian) { Data($0) })
        header.append(withUnsafeBytes(of: UInt32(sampleRate).littleEndian) { Data($0) })
        header.append(withUnsafeBytes(of: UInt32(sampleRate * 2).littleEndian) { Data($0) })
        header.append(withUnsafeBytes(of: UInt16(2).littleEndian) { Data($0) })
        header.append(withUnsafeBytes(of: UInt16(16).littleEndian) { Data($0) })
        header.append("data".data(using: .ascii)!)
        header.append(withUnsafeBytes(of: dataSize.littleEndian) { Data($0) })

        pcm.withUnsafeBufferPointer { ptr in
            header.append(UnsafeBufferPointer(start: UnsafeRawPointer(ptr.baseAddress!)?.assumingMemoryBound(to: UInt8.self), count: Int(dataSize)))
        }

        DispatchQueue.main.async {
            if let player = try? AVAudioPlayer(data: header) {
                player.prepareToPlay()
                player.play()
                self.players.removeAll { !$0.isPlaying }
                self.players.append(player)
            }
        }
    }
}
