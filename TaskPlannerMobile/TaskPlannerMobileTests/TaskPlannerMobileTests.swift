import XCTest
@testable import TaskPlannerMobile

final class TaskPlannerMobileTests: XCTestCase {

    /// AuthManager persists to the real Keychain, so a bare `AuthManager()` reflects whatever the
    /// environment already has (a configured simulator/device has live credentials). Isolate the test:
    /// snapshot existing credentials, assert the *unconfigured* contract on a cleared state, then
    /// restore — so the test is deterministic and leaves the environment exactly as it found it.
    func testAuthManagerUnconfiguredState() {
        let saved = AuthManager()
        let savedKey = saved.apiKey
        let savedSession = saved.activeSessionId
        defer {
            let restore = AuthManager()
            if let savedKey { restore.setAPIKey(savedKey) } else { restore.clearAll() }
            restore.setActiveSessionId(savedSession)
        }

        saved.clearAll()

        let auth = AuthManager()
        XCTAssertNil(auth.apiKey)
        XCTAssertNil(auth.activeSessionId)
        XCTAssertFalse(auth.isConfigured)
        XCTAssertFalse(auth.isFullyConfigured)
    }
}
