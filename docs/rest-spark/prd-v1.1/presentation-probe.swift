// Read-only local feasibility probe. Does not request permissions or capture pixels.
import AppKit
import CoreGraphics
import Intents

let pid = CommandLine.arguments.dropFirst().first.flatMap(Int.init)
var online = [CGDirectDisplayID](repeating: 0, count: 32)
var count: UInt32 = 0
let status = CGGetOnlineDisplayList(UInt32(online.count), &online, &count)
let displays = status == .success ? Array(online.prefix(Int(count))) : []
let entries = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID)
    as? [[String: Any]] ?? []
let owned = entries.filter { ($0[kCGWindowOwnerPID as String] as? Int) == pid }
let windowGeometry = owned.compactMap { entry -> [String: Any]? in
    guard let layer = entry[kCGWindowLayer as String] as? Int,
          let dictionary = entry[kCGWindowBounds as String] as? NSDictionary,
          let bounds = CGRect(dictionaryRepresentation: dictionary) else { return nil }
    let coverage = displays.map { id -> Double in
        let display = CGDisplayBounds(id)
        let overlap = bounds.intersection(display)
        guard !overlap.isNull else { return 0 }
        return Double(overlap.width * overlap.height / (display.width * display.height))
    }.max() ?? 0
    return ["layer": layer, "screenCoverage": coverage]
}
let matches = windowGeometry.filter { geometry in
    (geometry["layer"] as? Int == 0) && ((geometry["screenCoverage"] as? Double ?? 0) >= 0.95)
}
let result: [String: Any] = [
    "onlineDisplays": displays.count,
    "displayQueryStatus": status.rawValue,
    "onScreenWindowsOwnedByProbeTarget": owned.count,
    "mirroredDisplays": displays.filter { CGDisplayMirrorsDisplay($0) != kCGNullDirectDisplay }.count,
    "screenRecordingPreflight": CGPreflightScreenCaptureAccess(),
    "frontmostProcessMatches": NSWorkspace.shared.frontmostApplication?.processIdentifier == pid.map { pid_t($0) },
    "fullDisplayCandidateWindows": matches.count,
    "probeTargetWindowGeometry": windowGeometry,
    "focusAuthorization": INFocusStatusCenter.default.authorizationStatus.rawValue
]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(decoding: data, as: UTF8.self))
