import Foundation
import AVFoundation

enum VoiceMode: String, CaseIterable, Identifiable, Codable {
    case male
    case female
    // ★ 宇宙人は使わないが仕様維持のため残す
    case alien

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .male:   return "男性"
        case .female: return "女性"
        case .alien:  return "宇宙人"
        }
    }

    /// Apple TTS を使う時の voice。
    /// ★ Otoya が見つからなければ “nil を返す” → Google TTS にフォールバックさせる。
    func voice(for language: String = "ja-JP") -> AVSpeechSynthesisVoice? {
        let voices = AVSpeechSynthesisVoice.speechVoices()

        switch self {

        case .male:
            // Otoya があれば必ず使う
            if let v = voices.first(where: { $0.name.contains("Otoya") }) {
                return v
            }
            if let v = voices.first(where: { $0.identifier.lowercased().contains("otoya") }) {
                return v
            }
            // ★ 男性の自然音声が無い端末 → nil を返して Google Cloud TTS を使わせる
            return nil

        case .female:
            // iOS の女性 TTS は比較的安定しているので Kyoko → fallback
            if let v = voices.first(where: { $0.name.contains("Kyoko") }) {
                return v
            }
            if let v = voices.first(where: { $0.identifier.lowercased().contains("kyoko") }) {
                return v
            }
            return AVSpeechSynthesisVoice(language: language)

        case .alien:
            // とりあえず英語 voice
            return AVSpeechSynthesisVoice(language: "en-US")
        }
    }

    var defaultSpeed: Float {
        switch self {
        case .male: return 0.6
        case .female: return 0.6
        case .alien: return 0.7
        }
    }

    var defaultPitch: Float {
        switch self {
        case .male: return 0.9
        case .female: return 1.1
        case .alien: return 1.6
        }
    }
}
