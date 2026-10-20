// Petits éléments d'interface partagés : icônes, bouton micro, carte d'action.
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { Card } from "./api";
import type { Palette } from "./theme";

export const MicIcon = ({ color }: { color: string }) => (
  <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
    <Rect x={9} y={3} width={6} height={11} rx={3} /><Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);
export const StopIcon = ({ color }: { color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24"><Rect x={6} y={6} width={12} height={12} rx={2} fill={color} /></Svg>
);
export const ProfileIcon = ({ color }: { color: string }) => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round">
    <Circle cx={12} cy={8} r={4} /><Path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Svg>
);

export type Phase = "repos" | "ecoute" | "reflexion" | "parole";

export function MicButton({ phase, onPress, c }: { phase: Phase; onPress: () => void; c: Palette }) {
  const label = phase === "ecoute" ? "Arrêter l'écoute" : phase === "parole" ? "Interrompre NOÉMIA" : "Parler à NOÉMIA";
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} disabled={phase === "reflexion"}
      style={({ pressed }) => [s.mic, { borderColor: c.halo, backgroundColor: c.btn, shadowColor: c.halo,
        shadowRadius: phase === "ecoute" ? 26 : 14, transform: [{ scale: pressed ? 0.95 : 1 }], opacity: phase === "reflexion" ? 0.6 : 1 }]}>
      {phase === "parole" ? <StopIcon color={c.btnInk} /> : <MicIcon color={c.btnInk} />}
    </Pressable>
  );
}

export function ActionCard({ card, c, onConfirm, onCancel }: { card: Card; c: Palette; onConfirm: () => void; onCancel: () => void }) {
  return (
    <View style={[s.card, { backgroundColor: c.panelSoft, borderColor: c.line }]} accessibilityRole="summary">
      <Text style={[s.eyebrow, { color: c.halo }]}>{card.eyebrow.toUpperCase()}</Text>
      <Text style={[s.cardTitle, { color: c.ink }]}>{card.title}</Text>
      {card.body ? <Text style={[s.cardBody, { color: c.muted }]} numberOfLines={9}>{card.body}</Text> : null}
      {card.actionId ? (
        <View style={s.acts}>
          <Pressable onPress={onCancel} style={[s.act, { borderColor: c.line }]} accessibilityRole="button">
            <Text style={[s.actText, { color: c.ink }]}>Annuler</Text>
          </Pressable>
          <Pressable onPress={onConfirm} style={[s.act, { backgroundColor: c.halo, borderColor: c.halo }]} accessibilityRole="button">
            <Text style={[s.actText, { color: "#fff" }]}>{card.kind === "email" ? "Envoyer" : card.kind === "suppression" ? "Supprimer" : "Confirmer"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

export const s = StyleSheet.create({
  mic: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, alignItems: "center", justifyContent: "center", shadowOpacity: 0.8, shadowOffset: { width: 0, height: 0 } },
  card: { alignSelf: "stretch", marginHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: "600", letterSpacing: 1.6 },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  cardBody: { fontSize: 14, lineHeight: 20 },
  acts: { flexDirection: "row", gap: 10, marginTop: 12 },
  act: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  actText: { fontSize: 15, fontWeight: "600" },
});
