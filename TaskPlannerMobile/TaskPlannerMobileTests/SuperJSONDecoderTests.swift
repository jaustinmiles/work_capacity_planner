import XCTest
@testable import TaskPlannerMobile

/// Regression tests for `SuperJSONDecoder` — guards the null-payload crash where a tRPC query that
/// returns null (e.g. `workSession.getActive` with no active session) crashed the app via an
/// uncatchable NSException from `JSONSerialization.data(withJSONObject:)` on a null top-level.
final class SuperJSONDecoderTests: XCTestCase {
    private let decoder = SuperJSONDecoder()

    func testNullPayloadDecodesToNilOptional() throws {
        // { result: { data: { json: null } } } — the "no active session" shape.
        let data = Data(#"{"result":{"data":{"json":null,"meta":{}}}}"#.utf8)
        let result = try decoder.decode(WorkSession?.self, from: data)
        XCTAssertNil(result)
    }

    func testNonNullPayloadStillDecodes() throws {
        let data = Data(#"{"result":{"data":{"json":{"byType":{"focused":30},"totalMinutes":42}}}}"#.utf8)
        let result = try decoder.decode(AccumulatedTimeByDate.self, from: data)
        XCTAssertEqual(result.totalMinutes, 42)
        XCTAssertEqual(result.byType["focused"], 30)
    }

    func testServerErrorEnvelopeThrows() {
        let data = Data(#"{"error":{"message":"nope","data":{"code":"BAD_REQUEST","httpStatus":400}}}"#.utf8)
        XCTAssertThrowsError(try decoder.decode(WorkSession?.self, from: data))
    }
}
