import Foundation

struct GenerateRequestPayload: Encodable {
    let theme: String
    let genre: String
    let characters: String
    let length: Int
    let boke: [String]
    let tsukkomi: [String]
    let general: [String]
    let userId: String
    var mode: String = "conte"
    // Paid App Store download. Backend must explicitly accept this plan type.
    var planType: String? = "conte_ios_paid"
    var appTransactionJWS: String? = nil

    enum CodingKeys: String, CodingKey {
        case theme, genre, characters, length, boke, tsukkomi, general, mode
        case userId = "user_id"
        case planType = "plan_type"
        case appTransactionJWS = "app_transaction_jws"
    }
}

struct GenerateMetaPayload: Decodable {
    let structure: [String]?
    let techniques: [String]?
    let usageCount: Int?
    let paidCredits: Int?
    let setting: String?
    let stageStyle: String?
    let leftCostume: String?
    let rightCostume: String?

    enum CodingKeys: String, CodingKey {
        case structure, techniques, setting
        case usageCount = "usage_count"
        case paidCredits = "paid_credits"
        case stageStyle = "stage_style"
        case leftCostume = "left_costume"
        case rightCostume = "right_costume"
    }
}

struct GenerateResponsePayload: Decodable {
    let title: String
    let text: String
    let setting: String?
    let meta: GenerateMetaPayload?

    var effectiveSetting: String? { setting ?? meta?.setting }
}

struct CreditStatusResponse: Decodable {
    let paidCredits: Int
    let usageCount: Int
    enum CodingKeys: String, CodingKey {
        case paidCredits = "paid_credits"
        case usageCount = "usage_count"
    }
}

struct ContePresetResponse: Decodable {
    let theme: String
    let genre: String
    let characters: String
}
