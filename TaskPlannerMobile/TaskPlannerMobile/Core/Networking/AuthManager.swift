import Foundation
import Security

/// Manages API authentication credentials using the iOS Keychain.
///
/// Stores the API key and active session ID securely. The server URL
/// is stored in UserDefaults since it's not sensitive.
@Observable
final class AuthManager {

    private(set) var apiKey: String?
    private(set) var activeSessionId: String?

    var serverURL: URL {
        didSet {
            UserDefaults.standard.set(serverURL.absoluteString, forKey: Keys.serverURL)
        }
    }

    /// Whether the app has been configured with at minimum an API key
    var isConfigured: Bool {
        guard let apiKey else { return false }
        return !apiKey.isEmpty
    }

    /// Whether both API key and session are set (ready for full API access)
    var isFullyConfigured: Bool {
        isConfigured && activeSessionId != nil
    }

    init() {
        self.apiKey = Self.loadFromKeychain(key: Keys.apiKey)
        self.activeSessionId = Self.loadFromKeychain(key: Keys.sessionId)
        let urlString = UserDefaults.standard.string(forKey: Keys.serverURL)
            ?? "https://tasks.left-brain.co"
        self.serverURL = URL(string: urlString)!
    }

    // MARK: - Public API

    func setAPIKey(_ key: String) {
        apiKey = key
        Self.saveToKeychain(key: Keys.apiKey, value: key)
    }

    func setActiveSessionId(_ id: String?) {
        activeSessionId = id
        if let id {
            Self.saveToKeychain(key: Keys.sessionId, value: id)
        } else {
            Self.deleteFromKeychain(key: Keys.sessionId)
        }
    }

    func setServerURL(_ url: URL) {
        serverURL = url
    }

    func clearAll() {
        apiKey = nil
        activeSessionId = nil
        Self.deleteFromKeychain(key: Keys.apiKey)
        Self.deleteFromKeychain(key: Keys.sessionId)
    }

    // MARK: - Keychain Operations

    private enum Keys {
        static let apiKey = "com.taskplanner.apiKey"
        static let sessionId = "com.taskplanner.sessionId"
        static let serverURL = "com.taskplanner.serverURL"
    }

    private static func saveToKeychain(key: String, value: String) {
        let data = Data(value.utf8)

        // Delete existing item first
        let deleteQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(deleteQuery as CFDictionary)

        // Add new item
        let addQuery: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]
        SecItemAdd(addQuery as CFDictionary, nil)
    }

    private static func loadFromKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }

    private static func deleteFromKeychain(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
