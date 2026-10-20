// Écran principal : NOÉMIA plein écran, un bouton pour lui parler, sous-titres et cartes d'action.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Avatar, type AvatarHandle } from "../avatar/Avatar";
import { api, AuthError, type Card, type Settings, type Turn } from "../api";
import { ensureListenPermission, say, startListening, stopListening, stopSpeaking } from "../voice";
import { perform } from "../phone";
import { askNotificationPermission, checkUrgent, registerBackground, reschedule } from "../notifications";
import { useDaylight } from "../theme";
import { ActionCard, MicButton, ProfileIcon, type Phase } from "../ui";
import { Profile } from "./Profile";

type Props = { greeting?: string; onSignedOut: () => void };

export function Companion({ greeting, onSignedOut }: Props) {
  const { c, mode } = useDaylight();
  const insets = useSafeAreaInsets();
  const avatar = useRef<AvatarHandle>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("repos");
  const [subtitle, setSubtitle] = useState<{ who: "toi" | "noemia"; text: string }>({ who: "noemia", text: "" });
  const [card, setCard] = useState<Card | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const settings = useRef<Settings>({});
  const heard = useRef("");
  const speakingId = useRef(0);

  useEffect(() => { avatar.current?.send({ type: "theme", value: mode }); }, [mode, ready]);

  // Parle avec les lèvres synchronisées : mot par mot si iOS les signale, sinon par estimation
  const speak = useCallback(async (text: string, emotion = "neutre") => {
    const id = ++speakingId.current;
    const rate = settings.current.rate ?? 1;
    let gotWord = false;
    avatar.current?.send({ type: "emotion", name: emotion });
    avatar.current?.send({ type: "halo", state: "parole" });
    setPhase("parole");
    setSubtitle({ who: "noemia", text });
    await say(text, {
      voice: settings.current.voice, rate,
      onStart: () => setTimeout(() => { if (!gotWord && id === speakingId.current) avatar.current?.send({ type: "speak", text, rate }); }, 350),
      onWord: word => { gotWord = true; avatar.current?.send({ type: "word", word, rate }); },
    });
    if (id !== speakingId.current) return;
    avatar.current?.send({ type: "silence" });
    avatar.current?.send({ type: "halo", state: "repos" });
    setPhase("repos");
    setTimeout(() => { if (id === speakingId.current) avatar.current?.send({ type: "emotion", name: "neutre" }); }, 1500);
  }, []);

  const handleTurn = useCallback(async (t: Turn) => {
    const last = t.cards[t.cards.length - 1] ?? null;
    setCard(last);
    await speak(t.reply, t.emotion);
    for (const a of t.phone) {
      const err = await perform(a);
      if (err) await speak(err, "inquietude");
    }
    if (last && !last.actionId) setTimeout(() => setCard(cur => (cur === last ? null : cur)), 8000);
  }, [speak]);

  const ask = useCallback(async (text: string) => {
    setSubtitle({ who: "toi", text });
    setPhase("reflexion");
    avatar.current?.send({ type: "halo", state: "reflexion" });
    avatar.current?.send({ type: "emotion", name: "concentration" });
    try {
      await handleTurn(await api.chat(text));
    } catch (e: any) {
      if (e instanceof AuthError) return onSignedOut();
      avatar.current?.send({ type: "halo", state: "probleme" });
      await speak(e?.message?.includes("Network") ? "Je n'arrive pas à joindre mon serveur. Vérifie la connexion internet." : e.message, "inquietude");
    }
  }, [handleTurn, speak, onSignedOut]);

  const briefing = useCallback(async (kind: "matin" | "soir") => {
    setPhase("reflexion");
    avatar.current?.send({ type: "halo", state: "reflexion" });
    try { await handleTurn(await api.briefing(kind)); }
    catch (e: any) { if (e instanceof AuthError) onSignedOut(); else await speak(e.message, "inquietude"); }
  }, [handleTurn, speak, onSignedOut]);

  // Écoute
  useSpeechRecognitionEvent("result", ev => {
    const text = ev.results[0]?.transcript ?? "";
    heard.current = text;
    setSubtitle({ who: "toi", text });
  });
  useSpeechRecognitionEvent("error", ev => {
    if (ev.error !== "no-speech" && ev.error !== "aborted") setSubtitle({ who: "noemia", text: "Je n'ai pas réussi à t'écouter : " + ev.message });
  });
  useSpeechRecognitionEvent("end", () => {
    const text = heard.current.trim();
    heard.current = "";
    if (text) ask(text);
    else {
      setPhase("repos");
      avatar.current?.send({ type: "halo", state: "repos" });
      setSubtitle({ who: "noemia", text: "Je n'ai rien entendu. Touche le bouton et parle-moi." });
    }
  });

  const onMic = async () => {
    if (phase === "parole") {
      speakingId.current++;
      await stopSpeaking();
      avatar.current?.send({ type: "silence" });
      avatar.current?.send({ type: "halo", state: "repos" });
      setPhase("repos");
      return;
    }
    if (phase === "ecoute") return stopListening();
    if (!(await ensureListenPermission())) {
      return speak("J'ai besoin du micro et de la reconnaissance vocale. Tu peux les autoriser dans les Réglages de l'iPhone.", "inquietude");
    }
    setCard(cur => (cur?.actionId ? cur : null));
    heard.current = "";
    setPhase("ecoute");
    avatar.current?.send({ type: "halo", state: "ecoute" });
    avatar.current?.send({ type: "emotion", name: "neutre" });
    setSubtitle({ who: "noemia", text: "Je t'écoute…" });
    startListening();
  };

  // Démarrage : réglages, notifications, arrière-plan, accueil
  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        settings.current = me.settings ?? {};
        await askNotificationPermission();
        await reschedule(me.settings);
        await registerBackground();
        checkUrgent().catch(() => {});
      } catch (e) { if (e instanceof AuthError) onSignedOut(); }
    })();
  }, [onSignedOut]);

  useEffect(() => {
    if (!ready) return;
    if (greeting) speak(greeting, "sourire");
    else setSubtitle({ who: "noemia", text: "Touche le bouton pour me parler." });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toucher une notification : briefing, bilan…
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !last || handled.current === last.notification.request.identifier) return;
    handled.current = last.notification.request.identifier;
    const action = last.notification.request.content.data?.action;
    if (action === "briefing") briefing("matin");
    else if (action === "bilan") briefing("soir");
    else if (action === "email") ask("Qu'est-ce que c'est que cet email important ?");
  }, [last, ready, briefing, ask]);

  return (
    <View style={[st.root, { backgroundColor: c.bg }]}>
      <Avatar ref={avatar} onReady={() => setReady(true)} />

      <View style={[st.top, { paddingTop: insets.top + 8 }]}>
        <Text style={[st.brand, { color: c.ink }]}>NOÉMIA</Text>
        <Pressable onPress={() => setProfileOpen(true)} accessibilityRole="button" accessibilityLabel="Ouvrir le profil"
          style={[st.iconBtn, { borderColor: c.line, backgroundColor: c.panelSoft }]}>
          <ProfileIcon color={c.ink} />
        </Pressable>
      </View>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 20 }]}>
        {card ? (
          <ActionCard card={card} c={c}
            onConfirm={() => { setCard(null); ask("Oui, vas-y."); }}
            onCancel={() => { setCard(null); ask("Non, annule."); }} />
        ) : null}
        {subtitle.text ? (
          <View style={[st.sub, { backgroundColor: c.panelSoft }]}>
            <Text style={[st.subText, { color: subtitle.who === "toi" ? c.muted : c.ink, fontStyle: subtitle.who === "toi" ? "italic" : "normal" }]}
              accessibilityLiveRegion="polite">
              {subtitle.who === "toi" ? `« ${subtitle.text} »` : subtitle.text}
            </Text>
          </View>
        ) : null}
        <MicButton phase={phase} onPress={onMic} c={c} />
      </View>

      <Profile visible={profileOpen} onClose={(s?: Settings) => { setProfileOpen(false); if (s) settings.current = s; }}
        onSignedOut={onSignedOut} c={c} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18 },
  brand: { fontSize: 13, letterSpacing: 4, fontWeight: "500" },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 14 },
  sub: { marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, maxWidth: 420 },
  subText: { fontSize: 17, lineHeight: 24, textAlign: "center" },
});
