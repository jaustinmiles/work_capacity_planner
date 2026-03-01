import Foundation

/// Encodes inputs for tRPC mutations using superjson format.
///
/// tRPC with superjson transformer expects inputs wrapped as:
/// ```json
/// {
///   "json": { ...input data... },
///   "meta": {
///     "values": {
///       "startTime": ["Date"],
///       "deadline": ["Date"]
///     }
///   }
/// }
/// ```
///
/// The encoder serializes the input, identifies Date fields,
/// and constructs the proper superjson envelope.
final class SuperJSONEncoder {

    private let jsonEncoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()

    /// Encode an input value into superjson format for tRPC
    func encode<T: Encodable>(_ value: T) throws -> Data {
        // First, encode to JSON to get the serialized form
        let jsonData = try jsonEncoder.encode(value)

        // Parse back to identify Date fields and build meta
        guard let jsonObject = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            // For non-object types (arrays, primitives), wrap directly
            let envelope: [String: Any] = ["json": try JSONSerialization.jsonObject(with: jsonData)]
            return try JSONSerialization.data(withJSONObject: envelope)
        }

        // Find Date-valued paths by checking the original Encodable type
        let datePaths = findDatePaths(in: value)

        // Build the superjson envelope
        var envelope: [String: Any] = ["json": jsonObject]

        if !datePaths.isEmpty {
            var metaValues: [String: [String]] = [:]
            for path in datePaths {
                // Only include paths that have non-nil values
                if hasValue(at: path, in: jsonObject) {
                    metaValues[path] = ["Date"]
                }
            }
            if !metaValues.isEmpty {
                envelope["meta"] = ["values": metaValues]
            }
        }

        return try JSONSerialization.data(withJSONObject: envelope)
    }

    /// Encode a nil/empty input for procedures that take no input
    func encodeEmpty() throws -> Data {
        return try JSONSerialization.data(withJSONObject: ["json": NSNull()])
    }

    /// Check if a value exists at the given dot-path in a dictionary
    private func hasValue(at path: String, in dict: [String: Any]) -> Bool {
        let components = path.split(separator: ".").map(String.init)
        var current: Any = dict

        for component in components {
            if let dict = current as? [String: Any], let next = dict[component] {
                if next is NSNull { return false }
                current = next
            } else {
                return false
            }
        }
        return true
    }

    /// Use Mirror to find properties that are Date types
    private func findDatePaths<T>(in value: T, prefix: String = "") -> [String] {
        var paths: [String] = []
        let mirror = Mirror(reflecting: value)

        for child in mirror.children {
            guard let label = child.label else { continue }
            // Strip leading underscore from property wrappers
            let cleanLabel = label.hasPrefix("_") ? String(label.dropFirst()) : label
            let fullPath = prefix.isEmpty ? cleanLabel : "\(prefix).\(cleanLabel)"

            if child.value is Date {
                paths.append(fullPath)
            } else if let optional = child.value as? OptionalProtocol, optional.wrappedType is Date.Type {
                paths.append(fullPath)
            }
        }
        return paths
    }
}

/// Protocol to inspect Optional types via Mirror
private protocol OptionalProtocol {
    var wrappedType: Any.Type { get }
}

extension Optional: OptionalProtocol {
    var wrappedType: Any.Type { Wrapped.self }
}
