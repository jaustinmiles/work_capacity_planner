import Foundation
import SwiftUI

/// ViewModel for the quick task creation sheet.
///
/// Manages form state with smart defaults so users can create tasks
/// with minimal friction — just name + type + duration.
@Observable
final class QuickTaskViewModel {
    // MARK: - Form Fields
    var name: String = ""
    var selectedTypeId: String?
    var durationMinutes: Int = 30
    var importance: Int = 5
    var urgency: Int = 5
    var showPriority = false

    // MARK: - State
    var isCreating = false
    var errorMessage: String?
    var didCreate = false

    private var appState: AppState?

    func configure(with appState: AppState) {
        self.appState = appState
        selectedTypeId = appState.userTaskTypes.first?.id
    }

    var canCreate: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty
            && selectedTypeId != nil
            && durationMinutes > 0
    }

    func createTask() async {
        guard let appState, canCreate, let typeId = selectedTypeId else { return }
        isCreating = true
        errorMessage = nil

        do {
            let input = CreateTaskInput(
                name: name.trimmingCharacters(in: .whitespaces),
                duration: durationMinutes,
                importance: importance,
                urgency: urgency,
                type: typeId
            )
            _ = try await appState.taskService.create(input)

            let generator = UINotificationFeedbackGenerator()
            generator.notificationOccurred(.success)

            didCreate = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isCreating = false
    }
}
