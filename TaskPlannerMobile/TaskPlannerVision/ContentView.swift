import SwiftUI

/// Volume host: owns the scene view model, wires it to the shared root, and presents the
/// RealityView workspace. Lives in the volumetric WindowGroup.
struct SpatialWorkspaceView: View {
    @Environment(SpatialRoot.self) private var root
    @State private var viewModel = SpatialSceneViewModel()

    var body: some View {
        SpatialSceneView(viewModel: viewModel)
            .onAppear { viewModel.configure(with: root) }
            .onChange(of: root.sceneReloadToken) { _, _ in
                Task { await viewModel.load() }   // the AI agent changed data — refresh the scene
            }
    }
}
