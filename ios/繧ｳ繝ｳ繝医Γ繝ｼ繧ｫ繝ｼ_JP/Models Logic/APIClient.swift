import Foundation
import StoreKit

enum APIError: LocalizedError {
    case httpError(status: Int, message: String)
    case allServersFailed(lastMessage: String?)

    var errorDescription: String? {
        switch self {
        case .httpError(_, let message):
            return message
        case .allServersFailed(let lastMessage):
            return lastMessage ?? "すべてのサーバーへの接続に失敗しました"
        }
    }
}

final class APIClient {
    static let shared = APIClient()
    private init() {}

    private let urlCandidates: [URL] = [
        URL(string: "https://manzaimaker-backend-jp.vercel.app/api/generate")!,
        URL(string: "https://manzaimaker-backend-jp2.vercel.app/api/generate")!,
        URL(string: "https://manzaimaker-backend-jp3.vercel.app/api/generate")!
    ]

    private let retryableStatuses: Set<Int> = [429, 500, 502, 503, 504]

    // Server credit lookup; one backend endpoint, same `mode` as Android.
    func getCreditStatus(userId: String) async throws -> CreditStatusResponse {
        return try await postAction(["action": "get_credit", "mode": "conte", "user_id": userId])
    }

    #if DEBUG
    // テスト用のみ。既存の旧APIによるサーバー側の無制限解放。
    // Releaseビルドにはコンパイルされません。
    func debugUnlockUnlimited(userId: String) async throws {
        guard !userId.isEmpty else { throw URLError(.badURL) }
        let response: DebugUnlockResponse = try await postAction([
            "action": "add_credits",
            "mode": "conte",
            "user_id": userId,
            "product_id": "unlimited_unlock"
        ])
        guard response.ok && response.paidCredits >= 999999 else {
            throw APIError.httpError(status: 500, message: "テスト解放が反映されませんでした")
        }
    }

    private struct DebugUnlockResponse: Decodable {
        let ok: Bool
        let paidCredits: Int
        enum CodingKeys: String, CodingKey {
            case ok
            case paidCredits = "paid_credits"
        }
    }
    #endif

    func suggestSetting() async throws -> ContePresetResponse {
        return try await postAction(["action": "random_preset", "mode": "conte"])
    }

    private func postAction<T: Decodable>(_ body: [String: String]) async throws -> T {
        let url = urlCandidates[0]
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            let info = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpError(status: http.statusCode, message: info)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    func generate(payload: GenerateRequestPayload) async throws -> GenerateResponsePayload {
        var paidPayload = payload
        // Fetch Apple's signed transaction for the PAID APP itself (not an IAP).
        if #available(iOS 16.0, *) {
            let result = try await AppTransaction.shared
            switch result {
            case .verified(let transaction):
                paidPayload.appTransactionJWS = transaction.jwsRepresentation
            case .unverified:
                throw APIError.httpError(status: 403, message: "App Storeでのアプリ購入を確認できませんでした。")
            }
        } else {
            throw APIError.httpError(status: 403, message: "この機能にはiOS 16以降が必要です。")
        }
        let encoder = JSONEncoder()
        var lastErrorMessage: String?

        for (idx, url) in urlCandidates.enumerated() {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.timeoutInterval = 180
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(paidPayload)

            do {
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse else {
                    lastErrorMessage = "Invalid response from \(url)"
                    continue
                }

                if !(200..<300).contains(http.statusCode) {
                    let raw = String(data: data, encoding: .utf8) ?? ""
                    var serverMsg = raw
                    if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                       let err = obj["error"] as? String {
                        serverMsg = err
                    }
                    let message = "HTTP \(http.statusCode) / \(serverMsg)"
                    lastErrorMessage = message

                    // 課金を伴う生成リクエストを別サーバーへ自動再送しない。
                    // 上流が応答前に生成済みの場合、重複消費・重複生成になるため。
                    throw APIError.httpError(status: http.statusCode, message: message)
                }

                return try JSONDecoder().decode(GenerateResponsePayload.self, from: data)

            } catch let apiErr as APIError {
                // 非リトライ対象のHTTPエラー（402クレジット不足など）は即座に投げる
                throw apiErr
            } catch {
                // 通信断・タイムアウトでもサーバー処理の完了は不明なため再送しない。
                throw error
            }
        }

        throw APIError.allServersFailed(lastMessage: lastErrorMessage)
    }
}
