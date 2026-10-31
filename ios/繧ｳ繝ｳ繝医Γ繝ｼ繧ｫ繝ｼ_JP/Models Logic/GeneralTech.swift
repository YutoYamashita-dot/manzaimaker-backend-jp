import Foundation

enum GeneralTech: String, CaseIterable, Identifiable, Codable {
    case sandanOchi
    case gyakuhari
    case tenkaiHakai
    case kanchigaiTeisei
    case surechigai
    case tachibaGyakuten

    var id: String { rawValue }

    var label: String {
        switch self {
        case .sandanOchi: return "三段オチ"
        case .gyakuhari: return "逆張り構成"
        case .tenkaiHakai: return "展開破壊"
        case .kanchigaiTeisei: return "勘違い→訂正"
        case .surechigai: return "すれ違い"
        case .tachibaGyakuten: return "立場逆転"
        }
    }
}
