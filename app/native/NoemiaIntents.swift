// Siri, Raccourcis, Spotlight et Apple Intelligence : les actions de NOÉMIA.
// « Dis Siri, parle à NOÉMIA » · « Dis Siri, demande à NOÉMIA » · « Dis Siri, briefing NOÉMIA »
// Chaque action ouvre l'appli par un lien noemia://… que l'écran principal sait traiter.
// Ce fichier est ajouté à la cible principale par plugins/withAppIntents.js.
import AppIntents
import Foundation

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
    AppShortcut(intent: BilanNoemiaIntent(),
                phrases: ["Bilan \(.applicationName)", "Bilan du soir \(.applicationName)"],
                shortTitle: "Bilan du soir", systemImageName: "moon.stars")
  }
}
