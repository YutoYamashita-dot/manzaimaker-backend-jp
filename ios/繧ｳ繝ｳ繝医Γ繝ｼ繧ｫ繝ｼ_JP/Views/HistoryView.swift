import SwiftUI
import UIKit

struct HistoryView: View {
    @StateObject private var history = HistoryManager.shared
    @State private var showClearAlert = false

    private let dateFormatter: DateFormatter = {
        let df = DateFormatter()
        df.dateFormat = "yyyy/MM/dd HH:mm"
        return df
    }()

    var body: some View {
        VStack(spacing: 0) {

            Spacer()
                .frame(height: UIScreen.main.bounds.height * 0.05)

            if history.items.isEmpty {
                Text("保存されたネタはありません")
                    .foregroundColor(.gray)
                    .font(.system(size: 15))
                    .padding(8)
            }

            List {
                ForEach(history.items) { item in
                    NavigationLink {
                        ResultView(
                            title: item.title,
                            fullText: item.body,
                            sceneSetting: item.sceneSetting ?? "",
                            initialVoiceMode: VoiceModeStorage.loadVoiceMode(),
                            initialSpeed: VoiceModeStorage.loadSpeed(),
                            initialPitch: VoiceModeStorage.loadPitch(),
                            fromHistory: true // ★ 履歴から開いた場合は保存済にする
                        )
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title.isEmpty ? "無題" : item.title)
                                .font(.headline)

                            Text(previewBody(item.body))
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                                .lineLimit(2)

                            Text(dateFormatter.string(from: item.date))
                                .font(.caption)
                                .foregroundColor(.gray)
                        }
                    }
                    .contextMenu {
                        Button("コピー") {
                            UIPasteboard.general.string = SpeechManager.stripActionTags(from: item.body)
                        }

                        Button("削除", role: .destructive) {
                            history.delete(item: item)
                        }
                    }
                }
                .onDelete { offsets in
                    history.delete(at: offsets)
                }
            }
            .listStyle(.plain)
            .frame(maxHeight: UIScreen.main.bounds.height * 0.85)

            Button("履歴をすべて削除") {
                showClearAlert = true
            }
            .buttonStyle(HistoryClearButtonStyle())
            .padding(.horizontal, 16)
            .padding(.top, 12)

            Spacer()
                .frame(height: UIScreen.main.bounds.height * 0.05)
        }
        .navigationTitle("履歴")
        .alert("履歴をすべて削除しますか？", isPresented: $showClearAlert) {
            Button("キャンセル", role: .cancel) {}
            Button("削除する", role: .destructive) {
                history.deleteAll()
            }
        } message: {
            Text("この操作は取り消せません。")
        }
    }

    private func previewBody(_ text: String) -> String {
        let clean = SpeechManager.stripActionTags(from: text)
            .replacingOccurrences(of: "\n", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if clean.count <= 50 { return clean }
        let idx = clean.index(clean.startIndex, offsetBy: 50)
        return String(clean[..<idx]) + "..."
    }
}
