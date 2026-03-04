import Foundation

/// Decodes superjson-wrapped tRPC responses.
///
/// tRPC with superjson transformer wraps responses in:
/// ```json
/// {
///   "result": {
///     "data": {
///       "json": { ...actual data... },
///       "meta": {
///         "values": {
///           "createdAt": ["Date"],
///           "0.updatedAt": ["Date"]
///         }
///       }
///     }
///   }
/// }
/// ```
///
/// The `meta.values` map indicates which JSON paths contain Date values
/// (transmitted as ISO-8601 strings). The decoder extracts the `json` payload
/// and uses a standard JSONDecoder with `.iso8601` strategy since superjson
/// already serializes Dates as ISO strings.
final class SuperJSONDecoder {

    private let jsonDecoder: JSONDecoder = {
        let decoder = JSONDecoder()
        // superjson transmits dates as ISO-8601 strings
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)

            // Try ISO 8601 with fractional seconds first
            if let date = ISO8601DateFormatter.withFractionalSeconds.date(from: string) {
                return date
            }
            // Fall back to standard ISO 8601
            if let date = ISO8601DateFormatter.standard.date(from: string) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot decode date: \(string)"
            )
        }
        return decoder
    }()

    /// Decode a tRPC response, automatically unwrapping the superjson envelope
    func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        // Parse the outer envelope to extract the json payload
        guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw SuperJSONError.invalidEnvelope("Response is not a JSON object")
        }

        // Navigate: result.data.json
        let jsonPayload = try extractJSONPayload(from: envelope)

        // Re-serialize the extracted payload and decode with our configured decoder
        let payloadData = try JSONSerialization.data(withJSONObject: jsonPayload)
        return try jsonDecoder.decode(type, from: payloadData)
    }

    /// Decode a tRPC response that returns an array
    func decodeArray<T: Decodable>(_ type: [T].Type, from data: Data) throws -> [T] {
        return try decode(type, from: data)
    }

    /// Extract the `json` payload from the tRPC superjson envelope
    private func extractJSONPayload(from envelope: [String: Any]) throws -> Any {
        // Standard tRPC response: { result: { data: { json, meta } } }
        if let result = envelope["result"] as? [String: Any],
           let resultData = result["data"] as? [String: Any],
           let json = resultData["json"] {
            return json
        }

        // Batch response: [{ result: { data: { json, meta } } }]
        // We don't use batch, but handle it gracefully
        if let json = envelope["json"] {
            // Direct superjson object (no tRPC wrapper)
            return json
        }

        // tRPC error response
        if let error = envelope["error"] as? [String: Any] {
            let message = error["message"] as? String ?? "Unknown error"
            let errorData = error["data"] as? [String: Any]
            let code = errorData?["code"] as? String ?? "UNKNOWN"
            let httpStatus = errorData?["httpStatus"] as? Int ?? 500
            throw TRPCError.serverError(code: code, message: message, httpStatus: httpStatus)
        }

        throw SuperJSONError.invalidEnvelope("Cannot find json payload in response")
    }
}

// MARK: - SuperJSON Errors

enum SuperJSONError: LocalizedError {
    case invalidEnvelope(String)

    var errorDescription: String? {
        switch self {
        case .invalidEnvelope(let detail):
            return "Invalid superjson envelope: \(detail)"
        }
    }
}

// MARK: - ISO 8601 Formatters

extension ISO8601DateFormatter {
    /// ISO 8601 with fractional seconds (superjson default)
    static let withFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    /// Standard ISO 8601 without fractional seconds
    static let standard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
