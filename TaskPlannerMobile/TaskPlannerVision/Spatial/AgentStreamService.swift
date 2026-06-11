import Foundation

/// One parsed event from the agent's SSE stream. Mirrors the server's `AgentSSEEvent` union
/// (src/shared/agent-types.ts) — only the fields the spatial client needs.
enum AgentEvent {
    case textDelta(String)
    case toolStatus(label: String)
    case proposedAction(proposalId: String, title: String, description: String)
    case actionResult(proposalId: String, status: String, error: String?)
    case noToolWarning(reasoning: String)
    case done(toolCallCount: Int)
    case error(String)
}

private struct AgentChatRequest: Encodable {
    let userMessage: String
    let conversationId: String
}

/// Streams the Electron brainstorm agent into the Vision app. The agent endpoint is a RAW Express
/// SSE route (NOT tRPC, NOT superjson): it takes plain JSON `{userMessage, conversationId}` and
/// emits `data: {json}\n\n` frames. We POST with the same auth headers tRPC uses and parse frames
/// into `AgentEvent`s. Tool execution happens server-side, so the client gets app orchestration for
/// free — it only approves/rejects proposed writes and reloads the scene when the agent is done.
final class AgentStreamService {
    private let authManager: AuthManager

    init(authManager: AuthManager) {
        self.authManager = authManager
    }

    func stream(userMessage: String, conversationId: String) -> AsyncThrowingStream<AgentEvent, Error> {
        AsyncThrowingStream { continuation in
            let work = Task {
                do {
                    var request = URLRequest(url: authManager.serverURL.appendingPathComponent("api/agent/chat"))
                    request.httpMethod = "POST"
                    request.timeoutInterval = 300   // generous: the stream blocks while awaiting approvals
                    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
                    if let key = authManager.apiKey { request.setValue(key, forHTTPHeaderField: "x-api-key") }
                    if let sid = authManager.activeSessionId { request.setValue(sid, forHTTPHeaderField: "x-session-id") }
                    request.httpBody = try JSONEncoder().encode(
                        AgentChatRequest(userMessage: userMessage, conversationId: conversationId)
                    )

                    let (bytes, response) = try await URLSession.shared.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                        throw TRPCError.invalidResponse
                    }
                    // Each SSE event is a single `data: {json}` line followed by a blank line.
                    for try await line in bytes.lines {
                        guard line.hasPrefix("data:") else { continue }
                        let payload = line.dropFirst(5).trimmingCharacters(in: .whitespaces)
                        if payload.isEmpty { continue }
                        if let event = Self.decode(payload) { continuation.yield(event) }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in work.cancel() }
        }
    }

    private static func decode(_ json: String) -> AgentEvent? {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = obj["type"] as? String else { return nil }
        switch type {
        case "text_delta":
            return .textDelta(obj["content"] as? String ?? "")
        case "tool_status":
            return .toolStatus(label: obj["label"] as? String ?? "Working…")
        case "proposed_action":
            let preview = obj["preview"] as? [String: Any]
            let tool = obj["toolName"] as? String ?? "Action"
            return .proposedAction(
                proposalId: obj["proposalId"] as? String ?? "",
                title: preview?["title"] as? String ?? tool,
                description: preview?["description"] as? String ?? ""
            )
        case "action_result":
            return .actionResult(
                proposalId: obj["proposalId"] as? String ?? "",
                status: obj["status"] as? String ?? "",
                error: obj["error"] as? String
            )
        case "no_tool_warning":
            return .noToolWarning(reasoning: obj["reasoning"] as? String ?? "")
        case "done":
            return .done(toolCallCount: obj["toolCallCount"] as? Int ?? 0)
        case "error":
            return .error(obj["message"] as? String ?? "Agent error")
        default:
            return nil
        }
    }
}

/// tRPC wrappers for the agent's approval gate (these ARE tRPC procedures, unlike the SSE route).
final class AgentService {
    private let client: TRPCClient
    init(client: TRPCClient) { self.client = client }

    func approve(proposalId: String) async throws {
        try await client.mutateVoid("agent.approveAction", input: ProposalInput(proposalId: proposalId))
    }
    func reject(proposalId: String) async throws {
        try await client.mutateVoid("agent.rejectAction", input: ProposalInput(proposalId: proposalId))
    }
}

private struct ProposalInput: Codable { let proposalId: String }
