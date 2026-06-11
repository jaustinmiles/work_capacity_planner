import SwiftUI
import RealityKit

/// PHASE 0 SPIKE — throwaway. Verifies the core rendering primitives before the rebuild:
/// a SwiftUI glass card rendered as a RealityView attachment in a volume, with the system
/// baseplate hidden and a bottom-ornament toolbar visible. Delete after Phase 0 is confirmed.

enum SpikeWindowID {
    static let volume = "spike-volume"
}

/// Plain entry window — required so visionOS has a scene matching the default application
/// role (a lone volumetric window crashes at launch). Opens the volume.
struct SpikeLauncher: View {
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 16) {
            Text("Phase 0 Spike").font(.largeTitle.bold())
            Text("Open the volume and confirm: a glass card renders, no black baseplate, the toolbar button is visible and tappable.")
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            Button {
                openWindow(id: SpikeWindowID.volume)
            } label: {
                Label("Open Volume", systemImage: "cube.transparent")
                    .padding(.horizontal, 8)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(40)
        .frame(maxWidth: 520)
        .onAppear { openWindow(id: SpikeWindowID.volume) }
    }
}

/// The volume under test: one attachment card at the scene origin.
struct SpikeView: View {
    @State private var taps = 0

    var body: some View {
        RealityView { _, _ in
            // make: intentionally empty — attachments aren't ready yet (setup race).
        } update: { content, attachments in
            guard let card = attachments.entity(for: "spike-card") else { return }
            if card.parent == nil {
                card.position = [0, 0, 0]
                content.add(card)
            }
        } attachments: {
            Attachment(id: "spike-card") {
                VStack(spacing: 10) {
                    Image(systemName: "checkmark.seal.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(.green)
                    Text("Hello, Spatial")
                        .font(.title)
                    Text("If you can read this in a glass card, attachments render correctly.")
                        .font(.callout)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    Text("Toolbar taps: \(taps)")
                        .font(.caption)
                }
                .padding(28)
                .frame(width: 340)
                .glassBackgroundEffect()
            }
        }
        .volumeBaseplateVisibility(.hidden)
        .toolbar {
            ToolbarItemGroup(placement: .bottomOrnament) {
                Button {
                    taps += 1
                } label: {
                    Label("Tap me", systemImage: "hand.tap")
                }
            }
        }
    }
}
