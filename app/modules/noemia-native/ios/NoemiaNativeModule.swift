// Module natif de NOÉMIA, appelé depuis le JavaScript de l'appli.
// Chaque fonction iOS 26 (alarmes, IA et reconnaissance sur l'iPhone) vérifie sa disponibilité
// et renvoie « indisponible » sur un iOS plus ancien : l'appli bascule alors sur l'ancienne méthode.
import ExpoModulesCore
import ActivityKit
import CoreSpotlight
import UniformTypeIdentifiers
import MapKit
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif
#if canImport(FoundationModels)
import FoundationModels
#endif

private let iso = ISO8601DateFormatter()
private func date(_ s: String?) -> Date? {
  guard let s else { return nil }
  if let d = iso.date(from: s) { return d }
  let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f.date(from: s)
}

public class NoemiaNativeModule: Module {
  private var analyzer: AnyObject?

  public func definition() -> ModuleDefinition {
    Name("NoemiaNative")
    Events("onTranscript", "onTranscriptEnd", "onTranscriptError")

    // --- Session (pour Siri sans ouvrir l'appli) -------------------------------
    Function("setSession") { (token: String, apiUrl: String) in
      NoemiaKeychain.save(token)
      UserDefaults.standard.set(apiUrl, forKey: "noemia.apiUrl")
      NoemiaGroup.share(token: token, apiUrl: apiUrl)                       // extension « Partager »
      NoemiaWatchLink.shared.send(["token": token, "apiUrl": apiUrl])       // Apple Watch
    }
    Function("clearSession") {
      NoemiaKeychain.delete()
      NoemiaGroup.share(token: nil, apiUrl: UserDefaults.standard.string(forKey: "noemia.apiUrl") ?? "")
      NoemiaWatchLink.shared.send(["token": "", "apiUrl": ""])
    }

    // --- Concentration : état posé par le filtre « NOÉMIA » ----------------------
    Function("focusState") { () -> [String: Any] in
      let d = UserDefaults.standard
      return ["discret": d.bool(forKey: "noemia.focus.discret"), "actif": d.bool(forKey: "noemia.focus.actif")]
    }

    // --- Spotlight -------------------------------------------------------------
    AsyncFunction("indexSpotlight") { (items: [[String: String]]) async throws in
      let index = CSSearchableIndex.default()
      try await index.deleteSearchableItems(withDomainIdentifiers: ["souvenirs", "conversations"])
      let list = items.compactMap { d -> CSSearchableItem? in
        guard let id = d["id"], let title = d["title"] else { return nil }
        let a = CSSearchableItemAttributeSet(contentType: UTType.text)
        a.title = title
        a.contentDescription = d["content"]
        a.keywords = ["NOÉMIA", "souvenir"]
        return CSSearchableItem(uniqueIdentifier: id, domainIdentifier: d["domain"] ?? "souvenirs", attributeSet: a)
      }
      try await index.indexSearchableItems(list)
    }

    // --- Live Activity et Dynamic Island ------------------------------------------
    Function("liveActivitiesEnabled") { () -> Bool in ActivityAuthorizationInfo().areActivitiesEnabled }

    AsyncFunction("startActivity") { (kind: String, titre: String, detail: String, fin: String?) async throws -> String? in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      for a in Activity<NoemiaActivityAttributes>.activities where a.attributes.kind == kind {
        await a.end(nil, dismissalPolicy: .immediate)
      }
      let state = NoemiaActivityAttributes.ContentState(etat: kind, detail: detail, fin: date(fin))
      let activity = try Activity.request(attributes: NoemiaActivityAttributes(titre: titre, kind: kind),
                                          content: .init(state: state, staleDate: nil), pushType: nil)
      return activity.id
    }

    AsyncFunction("updateActivity") { (id: String, etat: String, detail: String, fin: String?, endAfterSeconds: Double?) async in
      for a in Activity<NoemiaActivityAttributes>.activities where a.id == id {
        let content = ActivityContent(state: NoemiaActivityAttributes.ContentState(etat: etat, detail: detail, fin: date(fin)), staleDate: nil)
        if let s = endAfterSeconds {
          await a.end(content, dismissalPolicy: s <= 0 ? .immediate : .after(Date().addingTimeInterval(s)))
        } else {
          await a.update(content)
        }
      }
    }

    AsyncFunction("endAllActivities") { () async in
      for a in Activity<NoemiaActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
    }

    // --- Trajet : estimation d'arrivée par Plans (sans clé ni abonnement) ------------
    AsyncFunction("tripEstimate") { (destination: String) async throws -> [String: Any] in
      let req = MKLocalSearch.Request()
      req.naturalLanguageQuery = destination
      guard let item = try await MKLocalSearch(request: req).start().mapItems.first else {
        throw Exception(name: "Introuvable", description: "Je ne trouve pas « \(destination) ».")
      }
      let dir = MKDirections.Request()
      dir.source = MKMapItem.forCurrentLocation()
      dir.destination = item
      dir.transportType = .automobile
      let eta = try await MKDirections(request: dir).calculateETA()
      let coord = item.placemark.coordinate
      return ["nom": item.name ?? destination,
              "arrivee": iso.string(from: eta.expectedArrivalDate),
              "minutes": Int((eta.expectedTravelTime / 60).rounded()),
              "lat": coord.latitude, "lon": coord.longitude]
    }

    // --- Alarmes et minuteurs natifs (AlarmKit, iOS 26) ------------------------------
    Function("alarmKitAvailable") { () -> Bool in
      if #available(iOS 26.0, *) { return true }
      return false
    }

    AsyncFunction("scheduleAlarm") { (at: String?, seconds: Double?, label: String) async throws -> Bool in
      #if canImport(AlarmKit)
      if #available(iOS 26.0, *) {
        return try await NoemiaAlarms.schedule(at: date(at), countdown: seconds, label: label)
      }
      #endif
      return false
    }

    // --- IA d'Apple sur l'iPhone (Foundation Models, iOS 26) ---------------------------
    Function("localModelStatus") { () -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) { return NoemiaLocalModel.status() }
      #endif
      return "indisponible"
    }

    AsyncFunction("localAnswer") { (prompt: String, instructions: String) async throws -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) { return try await NoemiaLocalModel.answer(prompt, instructions: instructions) }
      #endif
      throw Exception(name: "Indisponible", description: "L'IA de l'iPhone n'est pas disponible.")
    }

    // --- Reconnaissance vocale sur l'iPhone (SpeechAnalyzer, iOS 26) ----------------------
    Function("analyzerAvailable") { () -> Bool in
      if #available(iOS 26.0, *) { return true }
      return false
    }

    AsyncFunction("startAnalyzer") { (locale: String) async throws in
      guard #available(iOS 26.0, *) else { throw Exception(name: "Indisponible", description: "iOS 26 requis") }
      let a = NoemiaAnalyzer(
        onText: { [weak self] text, isFinal in self?.sendEvent("onTranscript", ["text": text, "isFinal": isFinal]) },
        onEnd: { [weak self] text in self?.sendEvent("onTranscriptEnd", ["text": text]) },
        onError: { [weak self] message in self?.sendEvent("onTranscriptError", ["message": message]) })
      self.analyzer = a
      try await a.start(locale: Locale(identifier: locale))
    }

    AsyncFunction("stopAnalyzer") { () async in
      if #available(iOS 26.0, *), let a = self.analyzer as? NoemiaAnalyzer { await a.stop() }
      self.analyzer = nil
    }
  }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
enum NoemiaAlarms {
  static func schedule(at: Date?, countdown: Double?, label: String) async throws -> Bool {
    let manager = AlarmManager.shared
    if manager.authorizationState != .authorized {
      guard try await manager.requestAuthorization() == .authorized else { return false }
    }
    let title = LocalizedStringResource(stringLiteral: label.isEmpty ? "NOÉMIA" : label)
    let stop = AlarmButton(text: "Arrêter", textColor: .white, systemImageName: "stop.circle")
    let alert = AlarmPresentation.Alert(title: title, stopButton: stop, secondaryButton: nil, secondaryButtonBehavior: nil)
    let presentation: AlarmPresentation
    if countdown != nil {
      let pause = AlarmButton(text: "Pause", textColor: .white, systemImageName: "pause.fill")
      let resume = AlarmButton(text: "Reprendre", textColor: .white, systemImageName: "play.fill")
      presentation = AlarmPresentation(alert: alert,
                                       countdown: AlarmPresentation.Countdown(title: title, pauseButton: pause),
                                       paused: AlarmPresentation.Paused(title: "En pause", resumeButton: resume))
    } else {
      presentation = AlarmPresentation(alert: alert)
    }
    let attributes = AlarmAttributes<NoemiaAlarmData>(presentation: presentation,
                                                      metadata: NoemiaAlarmData(label: label),
                                                      tintColor: Color(red: 0.31, green: 0.57, blue: 1.0))
    let schedule: Alarm.Schedule? = at.map { .fixed($0) }
    let duration: Alarm.CountdownDuration? = countdown.map { Alarm.CountdownDuration(preAlert: $0, postAlert: nil) }
    let config = AlarmManager.AlarmConfiguration<NoemiaAlarmData>(countdownDuration: duration, schedule: schedule,
                                                                   attributes: attributes, stopIntent: nil, secondaryIntent: nil)
    _ = try await manager.schedule(id: UUID(), configuration: config)
    return true
  }
}
#endif

#if canImport(FoundationModels)
@available(iOS 26.0, *)
enum NoemiaLocalModel {
  static func status() -> String {
    switch SystemLanguageModel.default.availability {
    case .available: return "disponible"
    case .unavailable(let reason): return "indisponible: \(reason)"
    @unknown default: return "indisponible"
    }
  }

  static func answer(_ prompt: String, instructions: String) async throws -> String {
    let session = LanguageModelSession(instructions: instructions)
    return try await session.respond(to: prompt).content
  }
}
#endif
