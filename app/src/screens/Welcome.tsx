// Première rencontre : NOÉMIA s'éveille, se présente, puis propose la connexion Google.
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, type AvatarHandle } from "../avatar/Avatar";
import { signInWithGoogle } from "../api";
import { frenchVoices, say } from "../voice";
import { useDaylight } from "../theme";

const INTRO = "Bonjour. Je suis NOÉMIA. Mathis m'a créée pour veiller sur le quotidien de la famille. Connecte-toi avec Google, et faisons connaissance.";

export function Welcome({ onSignedIn }: { onSignedIn: (name: string) => void }) {
  const { c, mode } = useDaylight();
  const insets = useSafeAreaInsets();
  const avatar = useRef<AvatarHandle>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready) return;
    avatar.current?.send({ type: "theme", value: mode });
    // Éveil : le halo s'allume, puis elle se présente
    avatar.current?.send({ type: "halo", state: "action" });
    const t = setTimeout(async () => {
      const voice = (await frenchVoices())[0]?.identifier;
      avatar.current?.send({ type: "emotion", name: "sourire" });
      avatar.current?.send({ type: "halo", state: "parole" });
      let gotWord = false;
      await say(INTRO, {
        voice,
        onStart: () => setTimeout(() => { if (!gotWord) avatar.current?.send({ type: "speak", text: INTRO }); }, 350),
        onWord: word => { gotWord = true; avatar.current?.send({ type: "word", word }); },
      });
      avatar.current?.send({ type: "silence" });
      avatar.current?.send({ type: "halo", state: "repos" });
    }, 1200);
    return () => clearTimeout(t);
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setBusy(true); setError("");
    try {
      const r = await signInWithGoogle();
      if (r) onSignedIn(r.name);
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  return (
    <View style={[st.root, { backgroundColor: c.bg }]}>
      <Avatar ref={avatar} onReady={() => setReady(true)} />
      <View style={[st.bottom, { paddingBottom: insets.bottom + 28 }]}>
        <View style={[st.panel, { backgroundColor: c.panelSoft }]}>
          <Text style={[st.hi, { color: c.ink }]}>Bonjour. Je suis NOÉMIA.</Text>
          <Text style={[st.sub, { color: c.muted }]}>Mathis m'a créée pour veiller sur votre quotidien.</Text>
        </View>
        {error ? <Text style={[st.error, { color: c.danger }]}>{error}</Text> : null}
        <Pressable onPress={connect} disabled={busy} accessibilityRole="button" style={({ pressed }) => [st.google, { opacity: pressed || busy ? 0.8 : 1 }]}>
          {busy ? <ActivityIndicator color="#1F1F1F" /> : <Text style={st.g}>G</Text>}
          <Text style={st.gText}>Continuer avec Google</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 16, paddingHorizontal: 20 },
  panel: { borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12, alignItems: "center" },
  hi: { fontSize: 22, fontWeight: "300", letterSpacing: 0.8 },
  sub: { fontSize: 14, marginTop: 4, textAlign: "center" },
  error: { fontSize: 14, textAlign: "center" },
  google: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFFFF", borderRadius: 26, paddingVertical: 14, paddingHorizontal: 24,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  g: { fontSize: 18, fontWeight: "800", color: "#4285F4" },
  gText: { fontSize: 16, fontWeight: "600", color: "#1F1F1F" },
});
