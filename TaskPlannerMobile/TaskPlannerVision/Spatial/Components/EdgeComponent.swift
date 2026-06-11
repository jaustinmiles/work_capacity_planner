import RealityKit

/// Marks an edge container entity connecting two node entities (by their ids, which are the node
/// entities' names). `EdgeSystem` positions the edge between the LIVE positions of its endpoints
/// each frame — so an edge follows a node while it's being dragged. The reconcile pass only
/// adds/removes edges (by key); it never repositions them.
struct EdgeComponent: Component {
    var fromName: String
    var toName: String
}
