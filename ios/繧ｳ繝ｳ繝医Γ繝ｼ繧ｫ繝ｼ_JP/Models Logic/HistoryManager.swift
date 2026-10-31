import SwiftUI
import Foundation
import Combine


struct HistoryItem: Identifiable, Codable, Equatable {
    let id: UUID
    let title: String
    let body: String
    let sceneSetting: String?
    let date: Date

    init(id: UUID = UUID(), title: String, body: String, sceneSetting: String? = nil, date: Date = Date()) {
        self.id = id
        self.title = title
        self.body = body
        self.sceneSetting = sceneSetting
        self.date = date
    }
}

final class HistoryManager: ObservableObject {
    static let shared = HistoryManager()
    @Published private(set) var items: [HistoryItem] = []

    private let storageKey = "history_items"

    private init() {
        load()
    }

    func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else {
            items = []
            return
        }
        items = (try? JSONDecoder().decode([HistoryItem].self, from: data)) ?? []
    }

    private func save() {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    func add(title: String, body: String, sceneSetting: String? = nil) {
        let item = HistoryItem(title: title, body: body, sceneSetting: sceneSetting)
        items.insert(item, at: 0)
        save()
    }

    func delete(at offsets: IndexSet) {
        items.remove(atOffsets: offsets)
        save()
    }

    func delete(item: HistoryItem) {
        if let index = items.firstIndex(of: item) {
            items.remove(at: index)
            save()
        }
    }

    func deleteAll() {
        items.removeAll()
    }
}
