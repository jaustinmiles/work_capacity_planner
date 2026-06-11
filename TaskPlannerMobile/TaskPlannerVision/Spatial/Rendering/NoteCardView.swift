import SwiftUI

/// A free-floating note card, rendered through the shared `SpatialCard` glass surface.
struct NoteCardView: View {
    let text: String

    var body: some View {
        SpatialCard(kind: .note, tint: SpatialColor.noteAccent) {
            Text(text.isEmpty ? "Note" : text)
                .font(.body)
        }
    }
}
