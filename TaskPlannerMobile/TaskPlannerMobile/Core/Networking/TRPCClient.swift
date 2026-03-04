import Foundation

/// Generic tRPC HTTP client for the Task Planner API.
///
/// Handles:
/// - GET for queries, POST for mutations (tRPC convention)
/// - superjson envelope encoding/decoding
/// - Auth headers (x-api-key, x-session-id)
/// - Error mapping from tRPC error format
///
/// Usage:
/// ```swift
/// let tasks: [TaskItem] = try await client.query("task.getAll")
/// let task: TaskItem = try await client.mutate("task.complete", input: CompleteInput(id: "123"))
/// ```
final class TRPCClient {

    private let session: URLSession
    private let authManager: AuthManager
    private let decoder = SuperJSONDecoder()
    private let encoder = SuperJSONEncoder()

    /// Base URL for tRPC endpoints (server URL + /trpc)
    private var baseURL: URL {
        authManager.serverURL.appendingPathComponent("trpc")
    }

    init(authManager: AuthManager) {
        self.authManager = authManager

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)
    }

    // MARK: - Public API

    /// Execute a tRPC query (GET request)
    func query<T: Decodable>(_ path: String, input: some Encodable) async throws -> T {
        return try await executeQuery(path: path, input: input)
    }

    /// Execute a tRPC query with no input (GET request)
    func query<T: Decodable>(_ path: String) async throws -> T {
        return try await executeQuery(path: path, input: nil as EmptyInput?)
    }

    /// Execute a tRPC mutation (POST request)
    func mutate<T: Decodable>(_ path: String, input: some Encodable) async throws -> T {
        return try await executeMutation(path: path, input: input)
    }

    /// Execute a tRPC mutation with no input (POST request)
    func mutate<T: Decodable>(_ path: String) async throws -> T {
        return try await executeMutation(path: path, input: nil as EmptyInput?)
    }

    /// Execute a mutation that returns a simple success response
    func mutateVoid(_ path: String, input: some Encodable) async throws {
        let _: SuccessResponse = try await executeMutation(path: path, input: input)
    }

    /// Check if the server is reachable
    func healthCheck() async throws -> Bool {
        let url = authManager.serverURL.appendingPathComponent("health")
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 10

        let (_, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else { return false }
        return httpResponse.statusCode == 200
    }

    // MARK: - Query (GET)

    private func executeQuery<T: Decodable, Input: Encodable>(
        path: String,
        input: Input?
    ) async throws -> T {
        var url = baseURL.appendingPathComponent(path)

        // For GET queries, input goes as a ?input= query parameter (URL-encoded superjson)
        if let input {
            let inputData = try encoder.encode(input)
            if let inputString = String(data: inputData, encoding: .utf8) {
                var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
                components.queryItems = [URLQueryItem(name: "input", value: inputString)]
                url = components.url!
            }
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        addAuthHeaders(to: &request)

        return try await send(request, path: path)
    }

    // MARK: - Mutation (POST)

    private func executeMutation<T: Decodable, Input: Encodable>(
        path: String,
        input: Input?
    ) async throws -> T {
        let url = baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        addAuthHeaders(to: &request)

        // Encode body in superjson format
        if let input {
            request.httpBody = try encoder.encode(input)
        } else {
            request.httpBody = try encoder.encodeEmpty()
        }

        return try await send(request, path: path)
    }

    // MARK: - Shared

    private func addAuthHeaders(to request: inout URLRequest) {
        if let apiKey = authManager.apiKey {
            request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        }
        if let sessionId = authManager.activeSessionId {
            request.setValue(sessionId, forHTTPHeaderField: "x-session-id")
        }
    }

    private func send<T: Decodable>(_ request: URLRequest, path: String) async throws -> T {
        #if DEBUG
        print("[tRPC] \(request.httpMethod ?? "?") \(request.url?.absoluteString ?? "?")")
        if let body = request.httpBody, let bodyStr = String(data: body, encoding: .utf8) {
            print("[tRPC] Body: \(bodyStr)")
        }
        #endif

        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw TRPCError.invalidResponse
        }

        #if DEBUG
        let responsePreview = String(data: data.prefix(500), encoding: .utf8) ?? "<binary>"
        print("[tRPC] Response \(httpResponse.statusCode): \(responsePreview)")
        #endif

        // Handle HTTP errors
        if httpResponse.statusCode == 401 {
            throw TRPCError.unauthorized
        }

        if !(200...299).contains(httpResponse.statusCode) {
            if let errorInfo = try? parseTRPCErrorBody(data) {
                throw TRPCError.serverError(
                    code: errorInfo.code,
                    message: errorInfo.message,
                    httpStatus: httpResponse.statusCode
                )
            }
            throw TRPCError.httpError(statusCode: httpResponse.statusCode)
        }

        // Decode superjson response
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            #if DEBUG
            print("[tRPC] Decode error for \(path): \(error)")
            let fullResponse = String(data: data, encoding: .utf8) ?? "<binary>"
            print("[tRPC] Full response body: \(fullResponse)")
            #endif
            throw error
        }
    }

    private func parseTRPCErrorBody(_ data: Data) throws -> (code: String, message: String) {
        // tRPC wraps errors in { error: { json: { message, code, data } } } with superjson
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw TRPCError.invalidResponse
        }

        // Try superjson format: { error: { json: { message, data: { code } } } }
        if let error = json["error"] as? [String: Any],
           let errorJson = error["json"] as? [String: Any] {
            let message = errorJson["message"] as? String ?? "Unknown error"
            let errorData = errorJson["data"] as? [String: Any]
            let code = errorData?["code"] as? String ?? "UNKNOWN"
            return (code, message)
        }

        // Try plain format: { error: { message, data: { code } } }
        if let error = json["error"] as? [String: Any] {
            let message = error["message"] as? String ?? "Unknown error"
            let errorData = error["data"] as? [String: Any]
            let code = errorData?["code"] as? String ?? "UNKNOWN"
            return (code, message)
        }

        throw TRPCError.invalidResponse
    }
}

// MARK: - Error Types

enum TRPCError: LocalizedError {
    case invalidResponse
    case unauthorized
    case httpError(statusCode: Int)
    case serverError(code: String, message: String, httpStatus: Int)
    case networkError(underlying: Error)

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .unauthorized:
            return "Invalid API key. Please check your settings."
        case .httpError(let statusCode):
            return "Server error (HTTP \(statusCode))"
        case .serverError(_, let message, _):
            return message
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        }
    }

    var isAuthError: Bool {
        switch self {
        case .unauthorized: return true
        case .serverError(let code, _, _): return code == "UNAUTHORIZED"
        default: return false
        }
    }
}

// MARK: - Helper Types

/// Placeholder for procedures with no input
struct EmptyInput: Encodable {}

/// Generic success response from mutations
struct SuccessResponse: Decodable {
    let success: Bool?
}

/// Simple ID input used by many procedures
struct IDInput: Codable {
    let id: String
}
