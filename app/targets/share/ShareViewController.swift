// « Partager › NOÉMIA » : texte, lien, photo ou PDF venant de n'importe quelle appli.
// La feuille demande ce qu'il faut en faire (« Résume-moi ça » par défaut), envoie au serveur
// de NOÉMIA avec la session partagée par l'appli, puis affiche la réponse.
import UIKit
import SwiftUI
import UniformTypeIdentifiers

// Groupe partagé avec l'appli. SideStore/AltStore peuvent le renommer : on lit alors leur valeur.
enum NoemiaGroup {
  static var id: String {
    (Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String])?.first ?? "group.fr.noem.noemia"
  }
  static var defaults: UserDefaults? { UserDefaults(suiteName: id) }
}

struct Partage {
  var texte = ""
  var image: Data?
  var pdf: Data?
  var apercu: String {
    if image != nil { return "Une photo" + (texte.isEmpty ? "" : " · " + texte.prefix(80)) }
    if pdf != nil { return "Un document PDF" }
    return String(texte.prefix(240))
  }
}

final class ShareViewController: UIViewController {
  override func viewDidLoad() {
    super.viewDidLoad()
    Task { @MainActor in
      let partage = await lirePartage()
      let vue = PartageVue(partage: partage) { [weak self] in
        self?.extensionContext?.completeRequest(returningItems: nil)
      }
      let host = UIHostingController(rootView: vue)
      addChild(host)
      host.view.frame = view.bounds
      host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      view.addSubview(host.view)
      host.didMove(toParent: self)
    }
  }

  private func lirePartage() async -> Partage {
    var p = Partage()
    let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
    for item in items {
      if let t = item.attributedContentText?.string, !t.isEmpty { p.texte += t + "\n" }
      for provider in item.attachments ?? [] {
        if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier),
           let data = try? await provider.loadItem(forTypeIdentifier: UTType.pdf.identifier, options: nil) {
          if let url = data as? URL { p.pdf = try? Data(contentsOf: url) } else if let d = data as? Data { p.pdf = d }
        } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier),
                  let data = try? await provider.loadItem(forTypeIdentifier: UTType.image.identifier, options: nil) {
          var img: UIImage?
          if let url = data as? URL { img = UIImage(contentsOfFile: url.path) }
          else if let d = data as? Data { img = UIImage(data: d) }
          else if let i = data as? UIImage { img = i }
          p.image = img.flatMap(Self.reduire)
        } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                  let data = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil),
                  let url = data as? URL {
          p.texte += url.absoluteString + "\n"
        } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                  let data = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil),
                  let t = data as? String {
          p.texte += t + "\n"
        }
      }
    }
    p.texte = p.texte.trimmingCharacters(in: .whitespacesAndNewlines)
    return p
  }

  // Photo réduite (1600 px max, JPEG) pour un envoi rapide
  static func reduire(_ img: UIImage) -> Data? {
    let maxSide: CGFloat = 1600
    let scale = min(1, maxSide / max(img.size.width, img.size.height))
    let size = CGSize(width: img.size.width * scale, height: img.size.height * scale)
    let r = UIGraphicsImageRenderer(size: size)
    return r.image { _ in img.draw(in: CGRect(origin: .zero, size: size)) }.jpegData(compressionQuality: 0.6)
  }
}

struct PartageVue: View {
  let partage: Partage
  let fermer: () -> Void
  @State private var consigne = "Résume-moi ça et dis-moi ce que je dois en faire."
  @State private var reponse: String?
  @State private var envoi = false

  var body: some View {
    NavigationStack {
      Form {
        Section("Ce que tu partages") { Text(partage.apercu).font(.callout).lineLimit(6) }
        Section("Que dois-je en faire ?") { TextField("Consigne", text: $consigne, axis: .vertical).lineLimit(2...5) }
        if let reponse {
          Section("NOÉMIA") { Text(reponse).font(.body).textSelection(.enabled) }
        }
      }
      .navigationTitle("NOÉMIA")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button(reponse == nil ? "Annuler" : "Fermer", action: fermer) }
        ToolbarItem(placement: .confirmationAction) {
          if reponse == nil {
            Button(envoi ? "Envoi…" : "Envoyer") { Task { await envoyer() } }.disabled(envoi).bold()
          }
        }
      }
      .tint(Color("halo"))
    }
  }

  @MainActor
  private func envoyer() async {
    envoi = true
    defer { envoi = false }
    guard let d = NoemiaGroup.defaults, let token = d.string(forKey: "noemia.token") else {
      reponse = "Ouvre d'abord NOÉMIA une fois : le partage s'activera tout seul."
      return
    }
    let api = d.string(forKey: "noemia.apiUrl") ?? "https://vps-1d994dff.vps.ovh.ca"
    var corps: [String: Any] = [
      "text": consigne + (partage.texte.isEmpty ? "" : "\n\nContenu partagé :\n" + String(partage.texte.prefix(12000))),
      "tz": TimeZone.current.identifier,
      "channel": "partage",
    ]
    if let img = partage.image { corps["image"] = ["data": img.base64EncodedString(), "media_type": "image/jpeg"] }
    if let pdf = partage.pdf, pdf.count < 8_000_000 { corps["document"] = ["data": pdf.base64EncodedString(), "media_type": "application/pdf"] }
    var req = URLRequest(url: URL(string: api + "/api/chat")!)
    req.httpMethod = "POST"
    req.timeoutInterval = 60
    req.setValue("application/json", forHTTPHeaderField: "content-type")
    req.setValue("Bearer \(token)", forHTTPHeaderField: "authorization")
    do {
      req.httpBody = try JSONSerialization.data(withJSONObject: corps)
      let (data, _) = try await URLSession.shared.data(for: req)
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      reponse = json?["reply"] as? String ?? json?["error"] as? String ?? "Je n'ai pas pu répondre."
    } catch {
      reponse = "Je n'arrive pas à joindre mon serveur pour l'instant."
    }
  }
}
