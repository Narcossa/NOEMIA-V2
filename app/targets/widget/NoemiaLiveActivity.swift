// Live Activity et Dynamic Island de NOÉMIA : elle travaille, un trajet, un minuteur ou une alarme.
// Les types ci-dessous sont des copies exactes de ceux du module de l'appli (NoemiaShared.swift).
import ActivityKit
import WidgetKit
import SwiftUI
#if canImport(AlarmKit)
import AlarmKit
#endif

public struct NoemiaActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public var etat: String
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

private let bleu = Color(red: 0.31, green: 0.57, blue: 1.0)

private func icone(_ etat: String) -> String {
  switch etat {
  case "trajet": return "car.fill"
  case "fini": return "checkmark.circle.fill"
  default: return "waveform"
  }
}

struct NoemiaLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: NoemiaActivityAttributes.self) { context in
      // Écran verrouillé et StandBy
      HStack(spacing: 12) {
        Image(systemName: icone(context.state.etat)).font(.title2).foregroundStyle(bleu)
        VStack(alignment: .leading, spacing: 2) {
          Text(context.attributes.titre).font(.headline)
          Text(context.state.detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
        }
        Spacer()
        if let fin = context.state.fin {
          Text(timerInterval: Date()...max(fin, Date()), countsDown: true)
            .font(.title3.monospacedDigit()).multilineTextAlignment(.trailing).frame(width: 72)
        }
      }
      .padding(16)
      .activityBackgroundTint(Color.black.opacity(0.75))
      .activitySystemActionForegroundColor(bleu)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Image(systemName: icone(context.state.etat)).font(.title2).foregroundStyle(bleu)
        }
        DynamicIslandExpandedRegion(.trailing) {
          if let fin = context.state.fin {
            Text(timerInterval: Date()...max(fin, Date()), countsDown: true).font(.title3.monospacedDigit()).frame(width: 70)
          }
        }
        DynamicIslandExpandedRegion(.bottom) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.titre).font(.headline)
            Text(context.state.detail).font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
          }
        }
      } compactLeading: {
        Image(systemName: icone(context.state.etat)).foregroundStyle(bleu)
      } compactTrailing: {
        if let fin = context.state.fin {
          Text(timerInterval: Date()...max(fin, Date()), countsDown: true).monospacedDigit().frame(width: 44)
        } else {
          Text("NOÉMIA").font(.caption2)
        }
      } minimal: {
        Image(systemName: icone(context.state.etat)).foregroundStyle(bleu)
      }
      .widgetURL(URL(string: "noemia://parler"))
      .keylineTint(bleu)
    }
  }
}

#if canImport(AlarmKit)
@available(iOS 26.0, *)
public struct NoemiaAlarmData: AlarmMetadata {
  public var label: String
  public init(label: String = "") { self.label = label }
}

// Minuteurs et alarmes natifs : compte à rebours dans la Dynamic Island
@available(iOS 26.0, *)
struct NoemiaAlarmActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: AlarmAttributes<NoemiaAlarmData>.self) { context in
      HStack(spacing: 12) {
        Image(systemName: "timer").font(.title2).foregroundStyle(bleu)
        Text(context.attributes.metadata?.label ?? "Minuteur").font(.headline)
        Spacer()
        AlarmCountdown(context: context).font(.title2.monospacedDigit())
      }
      .padding(16)
      .activityBackgroundTint(Color.black.opacity(0.75))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) { Image(systemName: "timer").foregroundStyle(bleu) }
        DynamicIslandExpandedRegion(.trailing) { AlarmCountdown(context: context).font(.title3.monospacedDigit()) }
        DynamicIslandExpandedRegion(.bottom) { Text(context.attributes.metadata?.label ?? "Minuteur NOÉMIA").font(.headline) }
      } compactLeading: {
        Image(systemName: "timer").foregroundStyle(bleu)
      } compactTrailing: {
        AlarmCountdown(context: context).monospacedDigit().frame(width: 44)
      } minimal: {
        Image(systemName: "timer").foregroundStyle(bleu)
      }
      .keylineTint(bleu)
    }
  }
}

@available(iOS 26.0, *)
struct AlarmCountdown: View {
  let context: ActivityViewContext<AlarmAttributes<NoemiaAlarmData>>
  var body: some View {
    switch context.state.mode {
    case .countdown(let c):
      Text(timerInterval: Date()...max(c.fireDate, Date()), countsDown: true)
    case .paused:
      Text("Pause")
    default:
      Text("")
    }
  }
}
#endif
