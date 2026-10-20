// Mode réunion : NOÉMIA écoute en continu et prend des notes, puis propose
// un compte rendu, les décisions et les tâches à créer (cochées d'office, modifiables).
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useKeepAwake } from "expo-keep-awake";
import { api, type Meeting as Summary } from "../api";
import { ensureListenPermission } from "../voice";
import { Native } from "../../modules/noemia-native/src";
import type { Palette } from "../theme";

export function MeetingMode({ visible, c, onClose }: { visible: boolean; c: Palette; onClose: (summary?: Summary) => void }) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<"ecoute" | "synthese" | "resultat">("ecoute");
  const [live, setLive] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState("");
  const committed = useRef("");     // texte des sessions de reconnaissance terminées
  const current = useRef("");       // session en cours
  const running = useRef(false);
  const apple = useRef(false);
  const sub = useRef<ReturnType<typeof Native.onTranscript>>(undefined);

  // Reconnaissance classique : iOS l'arrête au bout d'un moment, on la relance aussitôt
  const startClassic = () => ExpoSpeechRecognitionModule.start({ lang: "fr-FR", interimResults: true, continuous: true, addsPunctuation: true, iosTaskHint: "dictation" });
  useSpeechRecognitionEvent("result", ev => {
    if (!running.current || apple.current) return;
    current.current = ev.results[0]?.transcript ?? "";
    setLive((committed.current + " " + current.current).trim());
  });
  useSpeechRecognitionEvent("end", () => {
    if (!running.current || apple.current) return;
    committed.current = (committed.current + " " + current.current).trim();
    current.current = "";
    setTimeout(() => running.current && startClassic(), 150);
  });

  const start = async () => {
    if (!(await ensureListenPermission())) return onClose();
    committed.current = ""; current.current = ""; setLive(""); setSeconds(0); setSummary(null); setSaved("");
    setPhase("ecoute");
    running.current = true;
    apple.current = Native.analyzerAvailable();
    if (apple.current) {
      // Nouvelle reconnaissance d'Apple : pas de limite de durée
      sub.current?.remove();
      sub.current = Native.onTranscript(e => { current.current = e.text; setLive(e.text); });
      Native.startAnalyzer("fr-FR").catch(() => { apple.current = false; startClassic(); });
    } else startClassic();
  };

  const stopListening = async () => {
    running.current = false;
    sub.current?.remove(); sub.current = undefined;
    if (apple.current) await Native.stopAnalyzer(); else try { ExpoSpeechRecognitionModule.stop(); } catch {}
    return (committed.current + " " + current.current).trim();
  };

  const finish = async () => {
    const transcript = await stopListening();
    setPhase("synthese");
    try {
      const s = await api.meeting(transcript, Math.max(1, Math.round(seconds / 60)));
      setSummary(s);
      setChosen(new Set(s.taches.map((_, i) => i)));
    } catch (e: any) {
      setSummary({ titre: "Réunion", resume: "Je n'ai pas pu préparer le compte rendu : " + e.message, decisions: [], taches: [] });
    }
    setPhase("resultat");
  };

  const createTasks = async () => {
    const titres = summary!.taches.filter((_, i) => chosen.has(i));
    if (!titres.length) return;
    const r = await api.addTasks(titres, "Réunions").catch(() => null);
    setSaved(r ? `${titres.length} tâche${titres.length > 1 ? "s" : ""} ajoutée${titres.length > 1 ? "s" : ""} à « ${r.liste} ».` : "Je n'ai pas pu créer les tâches.");
  };

  useEffect(() => { if (visible) start(); else { running.current = false; } }, [visible]);  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!visible || phase !== "ecoute") return;
    const id = setInterval(() => setSeconds(x => x + 1), 1000);
    return () => clearInterval(id);
  }, [visible, phase]);

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => { stopListening(); onClose(); }}>
      {visible && phase === "ecoute" ? <KeepAwake /> : null}
      <View style={[st.root, { backgroundColor: c.panel, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={st.head}>
          <Text style={[st.eyebrow, { color: c.halo }]}>MODE RÉUNION</Text>
          {phase === "ecoute" ? <Text style={[st.timer, { color: c.ink }]}>● {mmss}</Text> : null}
        </View>

        {phase === "ecoute" ? (
          <>
            <ScrollView style={st.flex} contentContainerStyle={{ paddingVertical: 12 }}>
              <Text style={{ color: live ? c.ink : c.muted, fontSize: 16, lineHeight: 24 }}>
                {live || "Je prends des notes. Pose le téléphone sur la table, je m'occupe du reste."}
              </Text>
            </ScrollView>
            <View style={st.acts}>
              <Pressable onPress={() => { stopListening(); onClose(); }} style={[st.btn, { borderColor: c.line }]}><Text style={[st.btnText, { color: c.ink }]}>Annuler</Text></Pressable>
              <Pressable onPress={finish} style={[st.btn, { backgroundColor: c.halo, borderColor: c.halo }]}><Text style={[st.btnText, { color: "#fff" }]}>Terminer</Text></Pressable>
            </View>
          </>
        ) : phase === "synthese" ? (
          <View style={[st.flex, st.center]}>
            <ActivityIndicator color={c.halo} />
            <Text style={{ color: c.muted, marginTop: 12 }}>Je rédige le compte rendu…</Text>
          </View>
        ) : summary ? (
          <>
            <ScrollView style={st.flex} contentContainerStyle={{ gap: 10, paddingVertical: 12 }}>
              <Text style={[st.title, { color: c.ink }]}>{summary.titre}</Text>
              <Text selectable style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>{summary.resume}</Text>
              {summary.decisions.length ? <Text style={[st.group, { color: c.muted }]}>DÉCISIONS</Text> : null}
              {summary.decisions.map((d, i) => <Text key={i} selectable style={{ color: c.ink, fontSize: 15 }}>• {d}</Text>)}
              {summary.taches.length ? <Text style={[st.group, { color: c.muted }]}>TÂCHES À CRÉER</Text> : null}
              {summary.taches.map((t, i) => {
                const on = chosen.has(i);
                return (
                  <Pressable key={i} style={st.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    onPress={() => setChosen(x => { const n = new Set(x); on ? n.delete(i) : n.add(i); return n; })}>
                    <View style={[st.box, { borderColor: c.halo, backgroundColor: on ? c.halo : "transparent" }]}>
                      {on ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
                    </View>
                    <Text style={{ color: c.ink, fontSize: 15, flex: 1 }}>{t}</Text>
                  </Pressable>
                );
              })}
              {saved ? <Text style={{ color: c.halo, marginTop: 6 }}>{saved}</Text> : null}
            </ScrollView>
            <View style={st.acts}>
              <Pressable onPress={() => onClose(summary)} style={[st.btn, { borderColor: c.line }]}><Text style={[st.btnText, { color: c.ink }]}>Fermer</Text></Pressable>
              {summary.taches.length && !saved ? (
                <Pressable onPress={createTasks} style={[st.btn, { backgroundColor: c.halo, borderColor: c.halo }]}>
                  <Text style={[st.btnText, { color: "#fff" }]}>Créer {chosen.size} tâche{chosen.size > 1 ? "s" : ""}</Text>
                </Pressable>
              ) : null}
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

// Garde l'écran allumé pendant la prise de notes
function KeepAwake() { useKeepAwake(); return null; }

const st = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 20 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 12, fontWeight: "700", letterSpacing: 2 },
  timer: { fontSize: 15, fontVariant: ["tabular-nums"] },
  flex: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "500" },
  group: { fontSize: 11, fontWeight: "700", letterSpacing: 1.6, marginTop: 10 },
  check: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  acts: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { fontSize: 16, fontWeight: "600" },
});
