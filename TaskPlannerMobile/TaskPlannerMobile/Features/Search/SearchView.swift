import SwiftUI

/// Search tab — find tasks & workflows. Stub shell for Phase 5; results land later.
struct SearchView: View {
    @State private var query = ""

    var body: some View {
        NavigationStack {
            ContentUnavailableView {
                Label("Search", systemImage: "magnifyingglass")
            } description: {
                Text("Find tasks and workflows across your sessions.")
            }
            .navigationTitle("Search")
            .searchable(text: $query, prompt: "Tasks & workflows")
        }
    }
}
