import RealityKit
import simd

/// Positions each edge between its endpoints every frame, so dependency/cross-link edges track a
/// node while it is dragged. Endpoints anchor at the nodes' PORT handles (port→port routing), with
/// the node center as a fallback before a port exists. The transient `edge::pending` rubber-band
/// runs from the source node center to the dragged port's live tip.
///
/// Reads positions, writes only edge child transforms — composes with the other Systems without an
/// ownership check. Cards & edge containers are siblings under the implicit content root
/// (`edge.parent`); a port is a child of its card, so its position is converted into that shared
/// frame via `position(relativeTo: edge.parent)`.
struct EdgeSystem: System {
    private static let edges = EntityQuery(where: .has(EdgeComponent.self))
    private static let nodes = EntityQuery(where: .has(TransformAuthorityComponent.self))

    init(scene: Scene) {}

    func update(context: SceneUpdateContext) {
        var nodeByName: [String: Entity] = [:]
        for node in context.entities(matching: Self.nodes, updatingSystemWhen: .rendering) {
            nodeByName[node.name] = node
        }
        // Port children (output `ctl::port::` and input `ctl::inport::`) carry no
        // TransformAuthorityComponent, so index them separately.
        let outPrefix = "\(SpatialSceneView.controlPrefix)port::"
        let inPrefix = "\(SpatialSceneView.controlPrefix)inport::"
        var portByName: [String: Entity] = [:]
        for node in nodeByName.values {
            for child in node.children where child.name.hasPrefix(outPrefix) || child.name.hasPrefix(inPrefix) {
                portByName[child.name] = child
            }
        }

        let pendingName = "\(SpatialSceneView.edgePrefix)pending"
        for edge in context.entities(matching: Self.edges, updatingSystemWhen: .rendering) {
            guard let ends = edge.components[EdgeComponent.self] else { edge.isEnabled = false; continue }
            let from: SIMD3<Float>?
            let to: SIMD3<Float>?
            if edge.name == pendingName {
                // Rubber band: source node CENTER → the dragged output port's live tip.
                from = nodeByName[ends.fromName]?.position
                to = portByName[ends.toName].map { $0.position(relativeTo: edge.parent) }
            } else {
                // Directional: source anchors at its OUTPUT port (right), target at its INPUT port
                // (left) — so the edge reads output→input, not output→output.
                from = endpoint(ends.fromName, role: .output, portByName: portByName, nodeByName: nodeByName, edge: edge)
                to = endpoint(ends.toName, role: .input, portByName: portByName, nodeByName: nodeByName, edge: edge)
            }
            guard let from, let to else { edge.isEnabled = false; continue }
            layout(edge, from: from, to: to)
        }
    }

    private enum PortRole { case output, input }

    /// A node id resolves to its OUTPUT (`ctl::port::`) or INPUT (`ctl::inport::`) handle by role;
    /// the node center is the fallback before the port exists. A full `ctl::…` name (the pending
    /// edge's tip) resolves directly.
    private func endpoint(_ name: String, role: PortRole, portByName: [String: Entity],
                          nodeByName: [String: Entity], edge: Entity) -> SIMD3<Float>? {
        if name.hasPrefix(SpatialSceneView.controlPrefix) {
            return portByName[name].map { $0.position(relativeTo: edge.parent) }
        }
        let prefix = role == .output
            ? "\(SpatialSceneView.controlPrefix)port::"
            : "\(SpatialSceneView.controlPrefix)inport::"
        if let port = portByName["\(prefix)\(name)"] { return port.position(relativeTo: edge.parent) }
        return nodeByName[name]?.position
    }

    private func layout(_ edge: Entity, from: SIMD3<Float>, to: SIMD3<Float>) {
        let total = simd_distance(from, to)
        guard total > 0.02 else { edge.isEnabled = false; return }
        edge.isEnabled = true
        let mid = (from + to) / 2
        let length = max(total, 0.001)
        if let line = edge.findEntity(named: "line") {
            line.look(at: to, from: mid, relativeTo: edge)
            line.scale = SIMD3(1, 1, length)
        }
        edge.findEntity(named: "portA")?.position = from
        edge.findEntity(named: "portB")?.position = to
        // Removal × control sits at the midpoint (named ctl::unedge::<from>|<to>).
        edge.children.first { $0.name.hasPrefix("\(SpatialSceneView.controlPrefix)unedge::") }?.position = mid
        // Rename (pencil) control on a link edge sits just above the midpoint (ctl::editlink::<id>).
        edge.children.first { $0.name.hasPrefix("\(SpatialSceneView.controlPrefix)editlink::") }?.position =
            mid + SIMD3<Float>(0, 0.045, 0)
    }
}
