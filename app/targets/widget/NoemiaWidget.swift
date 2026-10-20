// Widgets NOÉMIA : un geste pour lui parler, depuis l'écran d'accueil, l'écran verrouillé
// ou le Centre de contrôle. Tous ouvrent l'appli par un lien noemia://…
import WidgetKit
import SwiftUI
import AppIntents

struct NoemiaEntry: TimelineEntry {
  let date: Date
}

struct NoemiaProvider: TimelineProvider {
  func placeholder(in context: Context) -> NoemiaEntry { NoemiaEntry(date: .now) }
  func getSnapshot(in context: Context, completion: @escaping (NoemiaEntry) -> Void) { completion(NoemiaEntry(date: .now)) }
  func getTimeline(in context: Context, completion: @escaping (Timeline<NoemiaEntry>) -> Void) {
    // Le message d'accueil suit le moment de la journée : une entrée par heure
    let now = Date()
    let entries = (0..<12).map { NoemiaEntry(date: Calendar.current.date(byAdding: .hour, value: $0, to: now)!) }
    completion(Timeline(entries: entries, policy: .atEnd))
  }
}

private func salut(_ d: Date) -> String {
  switch Calendar.current.component(.hour, from: d) {
  case 5..<12: return "Bonjour"
  case 12..<18: return "Bon après-midi"
  default: return "Bonsoir"
  }
}

struct NoemiaWidgetView: View {
  @Environment(\.widgetFamily) var family
  let entry: NoemiaEntry

  var body: some View {
    switch family {
    case .accessoryCircular:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "waveform").font(.title2)
      }
      .containerBackground(.clear, for: .widget)
      .widgetURL(URL(string: "noemia://parler"))
    case .accessoryRectangular:
      HStack(spacing: 6) {
        Image(systemName: "waveform")
        VStack(alignment: .leading) {
          Text("NOÉMIA").font(.headline)
          Text("Touche pour parler").font(.caption)
        }
      }
      .containerBackground(.clear, for: .widget)
      .widgetURL(URL(string: "noemia://parler"))
    case .systemMedium:
      HStack(spacing: 14) {
        Image("noemia").resizable().scaledToFill().frame(width: 96, height: 96).clipShape(Circle())
          .overlay(Circle().stroke(Color("halo"), lineWidth: 2))
        VStack(alignment: .leading, spacing: 8) {
          Text("\(salut(entry.date)).").font(.headline).foregroundStyle(Color("encre"))
          Link(destination: URL(string: "noemia://parler")!) {
            Label("Parler à NOÉMIA", systemImage: "waveform").font(.subheadline.weight(.semibold))
          }
          Link(destination: URL(string: "noemia://briefing")!) {
            Label("Mon briefing", systemImage: "sun.horizon").font(.subheadline)
          }
        }
        .foregroundStyle(Color("halo"))
        Spacer(minLength: 0)
      }
      .containerBackground(Color("fond"), for: .widget)
    default:
      VStack(spacing: 8) {
        Image("noemia").resizable().scaledToFill().frame(width: 74, height: 74).clipShape(Circle())
          .overlay(Circle().stroke(Color("halo"), lineWidth: 2))
        Text("Parler").font(.subheadline.weight(.semibold)).foregroundStyle(Color("halo"))
      }
      .containerBackground(Color("fond"), for: .widget)
      .widgetURL(URL(string: "noemia://parler"))
    }
  }
}

struct NoemiaWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "NoemiaWidget", provider: NoemiaProvider()) { entry in
      NoemiaWidgetView(entry: entry)
    }
    .configurationDisplayName("NOÉMIA")
    .description("Parle à NOÉMIA d'un simple toucher.")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
  }
}

// Bouton du Centre de contrôle (et du bouton Action) : « Parler à NOÉMIA »
struct OuvrirNoemiaControlIntent: AppIntent {
  static let title: LocalizedStringResource = "Parler à NOÉMIA"
  func perform() async throws -> some IntentResult & OpensIntent {
    .result(opensIntent: OpenURLIntent(URL(string: "noemia://parler")!))
  }
}

struct NoemiaControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "fr.noem.noemia.parler") {
      ControlWidgetButton(action: OuvrirNoemiaControlIntent()) {
        Label("Parler à NOÉMIA", systemImage: "waveform")
      }
    }
    .displayName("Parler à NOÉMIA")
    .description("Ouvre NOÉMIA, prête à t'écouter.")
  }
}

@main
struct NoemiaWidgets: WidgetBundle {
  var body: some Widget {
    NoemiaWidget()
    NoemiaControl()
  }
}
