// Actions rapides : des suggestions en un toucher, qui changent selon le moment de la journée.
// « Réunion » lance le mode réunion (prise de notes puis compte rendu).
import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import type { Palette } from "../theme";

export type QuickAction = { label: string; ask?: string; special?: "reunion" | "briefing" | "bilan" | "photo" };

export function quickActionsFor(date = new Date()): QuickAction[] {
  const h = date.getHours();
  const jour = date.getDay(); // 0 = dimanche
  const base: QuickAction[] = [{ label: "🎙 Réunion", special: "reunion" }, { label: "📷 Regarde ça", special: "photo" }];
  if (h >= 5 && h < 11) return [{ label: "☀️ Mon briefing", special: "briefing" }, { label: "Mes rendez-vous", ask: "Quels sont mes rendez-vous aujourd'hui ?" }, ...base, { label: "Mes emails", ask: "Quels emails importants ai-je reçus ?" }];
  if (h >= 11 && h < 17) return [{ label: "Prochain rendez-vous", ask: "C'est quoi mon prochain rendez-vous ?" }, ...base, { label: "Mes emails", ask: "Quoi de neuf dans mes emails ?" }, { label: "🛒 Courses", ask: "Montre-moi ma liste de courses." }];
  if (h >= 17 && h < 23) return [{ label: "🌙 Ma journée", special: "bilan" }, { label: "Demain", ask: "Qu'est-ce qui m'attend demain ?" }, { label: "🛒 Courses", ask: "Montre-moi ma liste de courses." }, ...base, ...(jour === 5 ? [{ label: "Ce week-end", ask: "Qu'est-ce que j'ai de prévu ce week-end ?" }] : [])];
  return [{ label: "Demain", ask: "Qu'est-ce qui m'attend demain ?" }, { label: "⏰ Réveil", ask: "Règle mon réveil pour demain matin." }, ...base];
}

export function QuickActions({ c, onPick }: { c: Palette; onPick: (a: QuickAction) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row} keyboardShouldPersistTaps="handled">
      {quickActionsFor().map(a => (
        <Pressable key={a.label} onPress={() => onPick(a)} accessibilityRole="button"
          style={({ pressed }) => [st.chip, { borderColor: c.halo, backgroundColor: pressed ? c.halo : c.panelSoft }]}>
          {({ pressed }) => <Text style={[st.text, { color: pressed ? "#fff" : c.halo }]}>{a.label}</Text>}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 18 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  text: { fontSize: 14, fontWeight: "600" },
});
