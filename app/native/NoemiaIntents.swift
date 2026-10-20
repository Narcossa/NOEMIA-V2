// Siri, Raccourcis, Spotlight et Apple Intelligence : les actions de NOÉMIA.
// « Dis Siri, parle à NOÉMIA » · « Dis Siri, demande à NOÉMIA » · « Dis Siri, briefing NOÉMIA »
// Chaque action ouvre l'appli par un lien noemia://… que l'écran principal sait traiter.
// Ce fichier est ajouté à la cible principale par plugins/withAppIntents.js.
import AppIntents
import Foundation
import Security

@available(iOS 18.0, *)
struct ParlerANoemiaIntent: AppIntent {
  static let title: LocalizedStringResource = "Parler à NOÉMIA"
  static let description = IntentDescription("Ouvre NOÉMIA, prête à t'écouter.")
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "noemia://parler")!))
  }
}

@available(iOS 18.0, *)
struct DemanderANoemiaIntent: AppIntent {
  static let title: LocalizedStringResource = "Demander à NOÉMIA"
  static let description = IntentDescription("Pose une question ou confie une tâche à NOÉMIA.")

  @Parameter(title: "Demande", requestValueDialog: IntentDialog("Que veux-tu demander à NOÉMIA ?"))
  var demande: String

  static var parameterSummary: some ParameterSummary { Summary("Demander à NOÉMIA : \(\.$demande)") }

  func perform() async throws -> some IntentResult & OpensIntent {
    var c = URLComponents(string: "noemia://demander")!
    c.queryItems = [URLQueryItem(name: "q", value: demande)]
    return .result(opensIntent: OpenURLIntent(c.url!))
  }
}

@available(iOS 18.0, *)
struct BriefingNoemiaIntent: AppIntent {
  static let title: LocalizedStringResource = "Briefing de NOÉMIA"
  static let description = IntentDescription("NOÉMIA te présente ta journée : rendez-vous, emails importants, tâches.")
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "noemia://briefing")!))
  }
}

@available(iOS 18.0, *)
struct BilanNoemiaIntent: AppIntent {
  static let title: LocalizedStringResource = "Bilan du soir de NOÉMIA"
  static let description = IntentDescription("NOÉMIA fait le point sur ta journée et prépare demain.")
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "noemia://bilan")!))
  }
}

// Réponse de Siri à voix haute, sans ouvrir l'appli : NOÉMIA répond via le serveur
@available(iOS 18.0, *)
struct QuestionRapideIntent: AppIntent {
  static let title: LocalizedStringResource = "Question rapide à NOÉMIA"
  static let description = IntentDescription("NOÉMIA te répond à voix haute, sans ouvrir l'appli.")
  static let openAppWhenRun: Bool = false

  @Parameter(title: "Question", requestValueDialog: IntentDialog("Oui ? Je t'écoute."))
  var question: String

  func perform() async throws -> some IntentResult & ProvidesDialog {
    guard let token = NoemiaSession.token() else {
      return .result(dialog: "Ouvre d'abord NOÉMIA une fois pour te connecter.")
    }
    let api = UserDefaults.standard.string(forKey: "noemia.apiUrl") ?? "https://vps-1d994dff.vps.ovh.ca"
    var req = URLRequest(url: URL(string: api + "/api/chat")!)
    req.httpMethod = "POST"
    req.timeoutInterval = 25
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    req.httpBody = try JSONSerialization.data(withJSONObject: ["text": question, "tz": TimeZone.current.identifier, "channel": "siri"])
    do {
      let (data, _) = try await URLSession.shared.data(for: req)
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      let reply = json?["reply"] as? String ?? (json?["error"] as? String ?? "Je n'ai pas pu répondre.")
      return .result(dialog: IntentDialog(stringLiteral: reply))
    } catch {
      return .result(dialog: "Je n'arrive pas à joindre mon serveur pour l'instant.")
    }
  }
}

// Filtre de Concentration : pendant « Travail » ou « Sommeil », NOÉMIA se fait discrète
@available(iOS 18.0, *)
struct NoemiaFocusFilter: SetFocusFilterIntent {
  static let title: LocalizedStringResource = "NOÉMIA pendant cette Concentration"
  static let description = IntentDescription("Choisis si NOÉMIA se fait discrète : pas de rappels sonores, réponses plus brèves.")

  @Parameter(title: "Mode discret")
  var discret: Bool?

  var displayRepresentation: DisplayRepresentation {
    DisplayRepresentation(title: (discret ?? true) ? "NOÉMIA discrète" : "NOÉMIA normale")
  }

  func perform() async throws -> some IntentResult {
    let d = UserDefaults.standard
    d.set(discret ?? false, forKey: "noemia.focus.discret")
    d.set(discret != nil, forKey: "noemia.focus.actif")
    return .result()
  }
}

// Lecture du jeton de session rangé par l'appli dans le trousseau
enum NoemiaSession {
  static func token() -> String? {
    let q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: "fr.noem.noemia.session",
      kSecAttrAccount as String: "token",
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: AnyObject?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }
}

@available(iOS 18.0, *)
struct NoemiaShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(intent: ParlerANoemiaIntent(),
                phrases: ["Parle à \(.applicationName)", "Parler à \(.applicationName)", "J'ai besoin de \(.applicationName)"],
                shortTitle: "Parler", systemImageName: "waveform")
    AppShortcut(intent: DemanderANoemiaIntent(),
                phrases: ["Demande à \(.applicationName)", "Pose une question à \(.applicationName)"],
                shortTitle: "Demander", systemImageName: "questionmark.bubble")
    AppShortcut(intent: BriefingNoemiaIntent(),
                phrases: ["Briefing \(.applicationName)", "Mon briefing \(.applicationName)"],
                shortTitle: "Briefing", systemImageName: "sun.horizon")
    AppShortcut(intent: QuestionRapideIntent(),
                phrases: ["Question rapide à \(.applicationName)", "Une question pour \(.applicationName)"],
                shortTitle: "Question rapide", systemImageName: "bubble.left.and.text.bubble.right")
    AppShortcut(intent: BilanNoemiaIntent(),
                phrases: ["Bilan \(.applicationName)", "Bilan du soir \(.applicationName)"],
                shortTitle: "Bilan du soir", systemImageName: "moon.stars")
  }
}
