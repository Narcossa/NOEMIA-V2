// Types partagés avec le widget (Live Activity, alarmes). Le widget en possède une copie identique :
// iOS associe l'activité au widget par le nom du type, pas par le module qui le compile.
import ActivityKit
import Foundation
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
