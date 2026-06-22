import Foundation

/// ViewModel for the Endeavors tab — loads the session's endeavors (hydrated with their tasks).
@Observable
final class EndeavorsViewModel {
    var endeavors: [Endeavor] = []
    var isLoading = false
    var errorMessage: String?

    private var appState: AppState?

    func configure(with appState: AppState) { self.appState = appState }

    func load() async {
        guard let appState else { return }
        isLoading = true
        errorMessage = nil
        do {
            endeavors = try await appState.endeavorService.getAll()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
