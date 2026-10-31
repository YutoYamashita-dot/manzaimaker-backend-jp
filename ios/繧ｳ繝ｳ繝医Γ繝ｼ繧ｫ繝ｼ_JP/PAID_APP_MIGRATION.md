# コントメーカー iOS：400円買い切り対応（クライアント側）

## 実施済み
- MainViewから無料3回、残回数、IAP購入・復元UI、StoreKitロード、デバッグ解放、クレジット照会を削除。
- GenerateRequestPayloadの `plan_type` を `conte_ios_paid` に変更。
- 生成結果・履歴・上演の実装は変更せず維持。
- Xcodeプロジェクトからの参照破損を避けるため、旧 `PurchaseManager.swift` と `CreditManager.swift` および `APIClient` の旧メソッドは現時点では残置（UIから呼び出されない）。削除はバックエンド移行後に別途推奨。

## 必須：バックエンド更新前はリリースしない
現在のサーバーは `conte_ios_unlimited` 等で残回数を判定している可能性がある。
`conte_ios_paid` をサーバー側で認識して、旧無料回数・追加購入の判定を廃止する必要がある。
`plan_type` はクライアントが自己申告する値であり、これだけを認証として無制限生成を許可してはいけない。API公開による不正利用を防ぐ制限・監視・認証・アプリ完全性検証等を設計すること。
既存の課金済ユーザーへの互換性・販売価格400円・App Store Connectの旧IAP販売停止設定も別途確認。

## 未実施の検証
この環境はmacOS/XcodeとiPhone実機を持たないため、`xcodebuild` と実機／TestFlightテストは未実施。Xcode上でビルドし、実機で生成・履歴・上演・失敗表示を検証すること。
