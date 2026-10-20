// Bandeau « Aujourd'hui » : l'essentiel de la journée d'un coup d'œil, sous le nom de NOÉMIA.
// Mis à jour à l'ouverture de l'appli puis toutes les 10 minutes ; chaque élément se touche.
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { api, type Today } from "../api";
import { deviceContext } from "../device";
import { meteoIcone } from "./Cards";
import type { Palette } from "../theme";

export function TodayBanner({ c, onAsk }: { c: Palette; onAsk: (question: string) => void }) {
  const [t, setT] = useState<Today | null>(null);

  const load = useCallback(async () => {
    try {
      const lieu = (await deviceContext()).lieu;
      setT(await api.today(lieu?.lat, lieu?.lon));
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60_000);
    const sub = AppState.addEventListener("change", s => { if (s === "active") load(); });
    return () => { clearInterval(id); sub.remove(); };
  }, [load]);

  if (!t) return null;
  const heure = t.prochain?.debut ? new Date(t.prochain.debut).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null;
  const chips: { label: string; ask: string; accent?: boolean }[] = [];
  if (t.prochain && heure) chips.push({ label: `${heure} · ${t.prochain.titre}`, ask: `Parle-moi de mon rendez-vous « ${t.prochain.titre} ».` });
  else chips.push({ label: "Aucun rendez-vous restant", ask: "Qu'est-ce que j'ai demain ?" });
  if (t.meteo) chips.push({ label: `${meteoIcone(t.meteo.icone)} ${t.meteo.temperature}°${t.meteo.max !== undefined ? ` · max ${t.meteo.max}°` : ""}`, ask: "Quel temps va-t-il faire cette semaine ?" });
  if (t.taches) chips.push({ label: `${t.taches} tâche${t.taches > 1 ? "s" : ""} aujourd'hui`, ask: "Quelles sont mes tâches du jour ?" });
  if (t.urgents) chips.push({ label: `${t.urgents} email${t.urgents > 1 ? "s" : ""} important${t.urgents > 1 ? "s" : ""}`, ask: "Résume-moi mes emails importants.", accent: true });

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row} accessibilityLabel="Aujourd'hui">
      {chips.map(ch => (
        <Pressable key={ch.label} onPress={() => onAsk(ch.ask)} accessibilityRole="button"
          style={[st.chip, { backgroundColor: c.panelSoft, borderColor: ch.accent ? c.halo : c.line }]}>
          <Text style={[st.text, { color: ch.accent ? c.halo : c.ink }]} numberOfLines={1}>{ch.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 18 },
  chip: { borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 7, maxWidth: 260 },
  text: { fontSize: 13, fontWeight: "500" },
});
