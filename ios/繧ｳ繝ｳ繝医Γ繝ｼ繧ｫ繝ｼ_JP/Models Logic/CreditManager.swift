import Foundation

final class CreditManager {
    static let shared = CreditManager()
    private static let balanceKey = "conte_remaining_credits_v2"
    private init() {}

    // UI shows free remaining + purchased remaining; only server is authoritative.
    var paidCredit: Int { UserDefaults.standard.integer(forKey: Self.balanceKey) }
    func canUse() -> Bool { true } // The API (HTTP 402) is authoritative.
    func setPaidCredit(_ value: Int) {
        UserDefaults.standard.set(max(0, value), forKey: Self.balanceKey)
    }
    func debugResetTo500() { setPaidCredit(500) }
}
