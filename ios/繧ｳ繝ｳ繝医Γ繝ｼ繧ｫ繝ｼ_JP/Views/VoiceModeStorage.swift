// VoiceModeStorage.swift
import Foundation

struct VoiceModeStorage {
    private static let modeKey  = "voice_mode"
    private static let speedKey = "voice_speed"
    private static let pitchKey = "voice_pitch"

    static func save(mode: VoiceMode, speed: Float, pitch: Float) {
        let defaults = UserDefaults.standard
        defaults.set(mode.rawValue, forKey: modeKey)
        // Store as Double for UserDefaults
        let clampedSpeed = min(max(speed, 0.3), 1.0)
        let clampedPitch = min(max(pitch, 0.5), 1.5)
        defaults.set(Double(clampedSpeed), forKey: speedKey)
        defaults.set(Double(clampedPitch), forKey: pitchKey)
    }

    static func loadVoiceMode() -> VoiceMode {
        let defaults = UserDefaults.standard
        if let raw = defaults.string(forKey: modeKey),
           let mode = VoiceMode(rawValue: raw) {
            return mode
        }
        // Default to male if nothing saved or value is invalid
        return .male
    }

    static func loadSpeed() -> Float {
        let defaults = UserDefaults.standard
        if defaults.object(forKey: speedKey) != nil {
            let v = defaults.double(forKey: speedKey)
            return Float(min(max(v, 0.3), 1.0))
        }
        // If not saved yet, use the default for the current (or default) mode
        return loadVoiceMode().defaultSpeed
    }

    static func loadPitch() -> Float {
        let defaults = UserDefaults.standard
        if defaults.object(forKey: pitchKey) != nil {
            let v = defaults.double(forKey: pitchKey)
            return Float(min(max(v, 0.5), 1.5))
        }
        // If not saved yet, use the default for the current (or default) mode
        return loadVoiceMode().defaultPitch
    }
}
