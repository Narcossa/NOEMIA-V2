// NOÉMIA sur l'Apple Watch : on touche « Parler », on dicte, elle répond à voix haute.
// La session est transmise par l'iPhone (WatchConnectivity) ; la montre appelle ensuite
// le serveur de NOÉMIA directement.
import SwiftUI
import WatchConnectivity
import AVFoundation

@main
struct NoemiaWatchApp: App {
  @StateObject private var lien = LienIPhone.shared
  var body: some Scene {
    WindowGroup { EcranNoemia().environmentObject(lien) }
  }
}

// Reçoit le jeton de session envoyé par l'appli iPhone
final class LienIPhone: NSObject, ObservableObject, WCSessionDelegate {
  static let shared = LienIPhone()
  @Published var connecte = UserDefaults.standard.string(forKey: "noemia.token") != nil

  override init() {
    super.init()
    if WCSession.isSupported() {
      WCSession.default.delegate = self
      WCSession.default.activate()
    }
  }

  private func appliquer(_ ctx: [String: Any]) {
    if let t = ctx["token"] as? String {
      if t.isEmpty { UserDefaults.standard.removeObject(forKey: "noemia.token") } else { UserDefaults.standard.set(t, forKey: "noemia.token") }
    }
    if let a = ctx["apiUrl"] as? String { UserDefaults.standard.set(a, forKey: "noemia.apiUrl") }
    DispatchQueue.main.async { self.connecte = UserDefaults.standard.string(forKey: "noemia.token") != nil }
  }

  func session(_ session: WCSession, activationDidCompleteWith state: WCSessionActivationState, error: Error?) {
    appliquer(session.receivedApplicationContext)
  }
  func session(_ session: WCSession, didReceiveApplicationContext ctx: [String: Any]) { appliquer(ctx) }
}

struct EcranNoemia: View {
  @EnvironmentObject var lien: LienIPhone
  @State private var question = ""
  @State private var reponse = "Touche « Parler » et dis-moi."
  @State private var travail = false
  private let voix = AVSpeechSynthesizer()

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        Image("noemia").resizable().scaledToFill().frame(width: 64, height: 64).clipShape(Circle())
          .overlay(Circle().stroke(Color("halo"), lineWidth: travail ? 3 : 1.5))
        if lien.connecte {
          TextFieldLink(prompt: Text("Je t'écoute…")) {
            Label(travail ? "Je réfléchis…" : "Parler", systemImage: "waveform")
          } onSubmit: { texte in
            Task { await demander(texte) }
          }
          .disabled(travail)
          .tint(Color("halo"))
        } else {
          Text("Ouvre NOÉMIA sur ton iPhone pour connecter la montre.").font(.footnote).multilineTextAlignment(.center)
        }
        Text(reponse).font(.footnote).multilineTextAlignment(.leading).frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, 4)
    }
  }

  @MainActor
  private func demander(_ texte: String) async {
    guard !texte.isEmpty, let token = UserDefaults.standard.string(forKey: "noemia.token") else { return }
    travail = true
    defer { travail = false }
    let api = UserDefaults.standard.string(forKey: "noemia.apiUrl") ?? "https://vps-1d994dff.vps.ovh.ca"
    var req = URLRequest(url: URL(string: api + "/api/chat")!)
    req.httpMethod = "POST"
    req.timeoutInterval = 40
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    req.httpBody = try? JSONSerialization.data(withJSONObject: ["text": texte, "tz": TimeZone.current.identifier, "channel": "montre"])
    do {
      let (data, _) = try await URLSession.shared.data(for: req)
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      reponse = json?["reply"] as? String ?? "Je n'ai pas pu répondre."
    } catch {
      reponse = "Je n'arrive pas à joindre mon serveur."
    }
    let u = AVSpeechUtterance(string: reponse)
    u.voice = AVSpeechSynthesisVoice(language: "fr-FR")
    voix.speak(u)
  }
}
