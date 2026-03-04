import XCTest
@testable import TaskPlannerMobile

final class TaskPlannerMobileTests: XCTestCase {
    func testAuthManagerDefaultState() {
        let auth = AuthManager()
        XCTAssertNil(auth.apiKey)
        XCTAssertNil(auth.sessionId)
        XCTAssertFalse(auth.isConfigured)
    }
}
