// Types partagés avec le widget (Live Activity, alarmes). Le widget en possède une copie identique :
// iOS associe l'activité au widget par le nom du type, pas par le module qui le compile.
import ActivityKit
import Foundation
import WatchConnectivity
#if canImport(AlarmKit)
import AlarmKit
#endif

public struct NoemiaActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var etat: String      // travail | trajet | fini
    public var detail: String
    public var fin: Date?
    public init(etat: String, detail: String, fin: Date?) {
      self.etat = etat; self.detail = detail; self.fin = fin
    }
  }
  public var titre: String
  public var kind: String
  public init(titre: String, kind: String) { self.titre = titre; self.kind = kind }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
public struct NoemiaAlarmData: AlarmMetadata {
  public var label: String
  public init(label: String = "") { self.label = label }
}
#endif

// Jeton de session NOÉMIA dans le trousseau : lu aussi par les actions Siri
enum NoemiaKeychain {
  static let service = "fr.noem.noemia.session"

  static func save(_ value: String) {
    delete()
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: "token",
      kSecValueData as String: Data(value.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]
    SecItemAdd(q as CFDictionary, nil)
  }

  static func delete() {
    let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "token"]
    SecItemDelete(q as CFDictionary)
  }
}

// Groupe partagé avec l'extension « Partager » (SideStore/AltStore peuvent le renommer)
enum NoemiaGroup {
  static var id: String {
    (Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String])?.first ?? "group.fr.noem.noemia"
  }
  static func share(token: String?, apiUrl: String) {
    guard let d = UserDefaults(suiteName: id) else { return }
    if let token { d.set(token, forKey: "noemia.token") } else { d.removeObject(forKey: "noemia.token") }
    d.set(apiUrl, forKey: "noemia.apiUrl")
  }
}

// Transmet la session à l'Apple Watch
final class NoemiaWatchLink: NSObject, WCSessionDelegate {
  static let shared = NoemiaWatchLink()
  private var pending: [String: Any]?

  func send(_ ctx: [String: Any]) {
    guard WCSession.isSupported() else { return }
    let s = WCSession.default
    pending = ctx
    if s.delegate == nil { s.delegate = self }
    if s.activationState == .activated { flush() } else { s.activate() }
  }

  private func flush() {
    guard let ctx = pending, WCSession.default.activationState == .activated, WCSession.default.isPaired else { return }
    try? WCSession.default.updateApplicationContext(ctx)
    pending = nil
  }

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) { flush() }
  func sessionDidBecomeInactive(_ session: WCSession) {}
  func sessionDidDeactivate(_ session: WCSession) { WCSession.default.activate() }
}
