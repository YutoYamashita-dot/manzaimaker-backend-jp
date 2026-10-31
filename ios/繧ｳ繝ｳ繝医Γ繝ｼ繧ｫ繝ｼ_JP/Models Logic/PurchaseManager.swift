import Foundation
import StoreKit
import Combine
import UIKit

@MainActor
final class PurchaseManager: ObservableObject {
    static let shared = PurchaseManager()
    @Published private(set) var product: Product?
    @Published private(set) var isPurchasing = false
    @Published var errorMessage: String?

    private let productID = "unlimited_unlock"
    private let verificationURL = URL(string: "https://manzaimaker-backend-jp.vercel.app/api/iap/verify")!
    private let accountTokenKey = "conte_purchase_app_account_token_v1"
    private var updateTask: Task<Void, Never>?

    private init() {
        updateTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { break }
                if case .verified(let transaction) = result, transaction.productID == self.productID {
                    do { try await self.deliver(transaction, signedTransaction: result.jwsRepresentation) }
                    catch { self.errorMessage = "購入の反映を再試行します: \(error.localizedDescription)" }
                }
            }
        }
    }

    private var appAccountToken: UUID {
        if let stored = UserDefaults.standard.string(forKey: accountTokenKey), let value = UUID(uuidString: stored) { return value }
        let value = UUID()
        UserDefaults.standard.set(value.uuidString, forKey: accountTokenKey)
        return value
    }

    func loadProducts() async {
        do {
            product = try await Product.products(for: [productID]).first(where: { $0.id == productID })
            if product == nil { errorMessage = "App Storeの商品が見つかりません。App Store Connectで商品IDをご確認ください。" }
        } catch { errorMessage = "商品情報を取得できません: \(error.localizedDescription)" }
    }

    func purchaseUnlimited() async throws {
        if product == nil { await loadProducts() }
        guard let product else { throw NSError(domain: "ConteIAP", code: 1, userInfo: [NSLocalizedDescriptionKey: "商品情報がありません"]) }
        isPurchasing = true
        errorMessage = nil
        defer { isPurchasing = false }
        let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
        switch result {
        case .success(let verification):
            switch verification {
            case .verified(let transaction): try await deliver(transaction, signedTransaction: verification.jwsRepresentation)
            case .unverified(_, let error): throw error
            }
        case .pending:
            errorMessage = "購入の承認待ちです。承認後に自動で反映します。"
        case .userCancelled: break
        @unknown default: break
        }
    }

    func recoverUnfinishedTransactions() async {
        for await result in Transaction.unfinished {
            if case .verified(let transaction) = result, transaction.productID == productID {
                do { try await deliver(transaction, signedTransaction: result.jwsRepresentation) }
                catch { errorMessage = "未反映の購入があります。もう一度この画面を開いてください。" }
            }
        }
    }

    func restorePurchases() async throws {
        try await AppStore.sync()
        var found = false
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.productID == productID {
                found = true
                try await deliver(transaction, signedTransaction: result.jwsRepresentation)
            }
        }
        if !found { errorMessage = "復元可能な買い切り購入が見つかりませんでした。" }
    }

    private func deliver(_ transaction: Transaction, signedTransaction: String) async throws {
        // finish only after verified credit is committed by backend (idempotent).
        let userId = UIDevice.current.identifierForVendor?.uuidString ?? ""
        guard !userId.isEmpty else { throw NSError(domain: "ConteIAP", code: 2, userInfo: [NSLocalizedDescriptionKey: "端末IDが取得できません"]) }
        guard !signedTransaction.isEmpty else {
            throw NSError(domain: "ConteIAP", code: 3, userInfo: [NSLocalizedDescriptionKey: "Apple署名データがありません"])
        }
        var request = URLRequest(url: verificationURL)
        request.httpMethod = "POST"
        request.timeoutInterval = 45
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "signed_transaction": signedTransaction,
            "user_id": userId,
            "app_account_token": appAccountToken.uuidString.lowercased()
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "サーバー応答なし"
            throw NSError(domain: "ConteIAP", code: 4, userInfo: [NSLocalizedDescriptionKey: "購入検証エラー: \(message)"])
        }
        let result = try JSONDecoder().decode(CreditDelivery.self, from: data)
        guard result.ok else { throw NSError(domain: "ConteIAP", code: 5, userInfo: [NSLocalizedDescriptionKey: "購入反映に失敗しました"]) }
        await transaction.finish()
    }
}

private struct CreditDelivery: Decodable {
    let ok: Bool
    let granted: Bool?
    let already_processed: Bool?
    let paid_credits: Int?
}
