// Écran principal : NOÉMIA plein écran et une vraie conversation.
// Un appui lance l'échange ; après chaque réponse elle se remet à écouter toute seule.
// Appui pendant qu'elle parle : on l'interrompt et on lui parle. Appui long : fin de la conversation.
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Avatar, type AvatarHandle } from "../avatar/Avatar";
import { api, AuthError, briefingStream, chatStream, type Card, type PhoneAction, type Settings, type StreamEvent } from "../api";
import { ensureListenPermission } from "../voice";
import { Speaker } from "../speaker";
import { Ear } from "../ear";
import { perform } from "../phone";
import { askNotificationPermission, checkUrgent, registerBackground, reschedule } from "../notifications";
import { useDaylight } from "../theme";
import { ActionCard, MicButton, ProfileIcon, type Phase } from "../ui";
import { Profile } from "./Profile";

type Props = { greeting?: string; onSignedOut: () => void };

const GOODBYE = /\b(au revoir|à plus|a plus|bonne nuit|merci c'est tout|c'est tout merci|ce sera tout|rien d'autre|c'est bon merci|tu peux te reposer)\b/i;

// Ce que NOÉMIA dit pendant qu'un outil travaille, si elle n'a encore rien dit
const STATUS: Record<string, string> = {
  agenda_lister: "Je regarde ton agenda.", emails_chercher: "Je parcours tes emails.", email_lire: "Je le lis.",
  taches_lister: "Je regarde tes listes.", contacts_chercher: "Je cherche le contact.", memoire_chercher: "Je fouille dans ma mémoire.",
};

export function Companion({ greeting, onSignedOut }: Props) {
  const { c, mode } = useDaylight();
  const insets = useSafeAreaInsets();
  const avatar = useRef<AvatarHandle>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhaseState] = useState<Phase>("repos");
  const [inConversation, setInConversation] = useState(false);
  const [subtitle, setSubtitle] = useState<{ who: "toi" | "noemia"; text: string }>({ who: "noemia", text: "" });
  const [card, setCard] = useState<Card | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const settings = useRef<Settings>({});
  const conversation = useRef(false);
  const phaseRef = useRef<Phase>("repos");
  const abort = useRef<AbortController | null>(null);

  const send = (m: Parameters<AvatarHandle["send"]>[0]) => avatar.current?.send(m);
  const setPhase = (p: Phase) => {
    phaseRef.current = p; setPhaseState(p);
    send({ type: "halo", state: p === "repos" ? "repos" : p === "ecoute" ? "ecoute" : p === "reflexion" ? "reflexion" : "parole" });
  };

  // Voix : file de phrases, lèvres synchronisées
  const speaker = useRef(new Speaker({
    onStart: () => setPhase("parole"),
    onSentence: text => setSubtitle({ who: "noemia", text }),
    onWord: word => send({ type: "word", word, rate: speaker.current.rate }),
    onEstimate: text => send({ type: "speak", text, rate: speaker.current.rate }),
  }));

  // Oreille : écoute continue, fin de phrase détectée au silence
  const ear = useRef<Ear | null>(null);
  const onHeardRef = useRef<(text: string) => void>(() => {});
  if (!ear.current) ear.current = new Ear(text => onHeardRef.current(text), text => setSubtitle({ who: "toi", text }));

  useSpeechRecognitionEvent("result", ev => ear.current!.result(ev.results[0]?.transcript ?? ""));
  useSpeechRecognitionEvent("end", () => ear.current!.finish());
  useSpeechRecognitionEvent("error", ev => {
    if (ev.error !== "no-speech" && ev.error !== "aborted") setSubtitle({ who: "noemia", text: "Je n'ai pas réussi à t'écouter : " + ev.message });
  });

  useEffect(() => { send({ type: "theme", value: mode }); }, [mode, ready]);

  const endConversation = useCallback((note?: string) => {
    conversation.current = false; setInConversation(false);
    ear.current!.abort();
    setPhase("repos");
    if (note) setSubtitle({ who: "noemia", text: note });
    setTimeout(() => { if (phaseRef.current === "repos") send({ type: "emotion", name: "neutre" }); }, 1500);
  }, []);

  const listen = useCallback(async () => {
    if (!(await ensureListenPermission())) {
      endConversation();
      await speaker.current.sayNow("J'ai besoin du micro et de la reconnaissance vocale. Tu peux les autoriser dans les Réglages de l'iPhone.");
      return;
    }
    setPhase("ecoute");
    setSubtitle({ who: "noemia", text: "Je t'écoute…" });
    ear.current!.start(conversation.current ? 6000 : 8000);
  }, [endConversation]);

  // Un tour complet : texte diffusé → phrases dites au fil de l'eau → actions → nouvelle écoute
  const runTurn = useCallback(async (start: (onEvent: (e: StreamEvent) => void, signal: AbortSignal) => Promise<void>) => {
    setPhase("reflexion");
    send({ type: "emotion", name: "concentration" });
    const sp = speaker.current;
    sp.voice = settings.current.voice; sp.rate = settings.current.rate ?? 1;
    sp.begin();
    let saidSomething = false;
    let phone: PhoneAction[] = [];
    abort.current = new AbortController();
    // Si rien n'arrive vite, un petit mot pour meubler
    const filler = setTimeout(() => { if (!saidSomething) { saidSomething = true; sp.push("Hmm… "); } }, 2200);
    try {
      await start(ev => {
        switch (ev.type) {
          case "emotion": send({ type: "emotion", name: ev.name }); break;
          case "text": if (ev.text.trim()) saidSomething = true; sp.push(ev.text); break;
          case "status": if (!saidSomething && STATUS[ev.tool]) { saidSomething = true; sp.push(STATUS[ev.tool] + " "); } break;
          case "done": {
            const last = ev.cards[ev.cards.length - 1] ?? null;
            setCard(last);
            if (last && !last.actionId) setTimeout(() => setCard(cur => (cur === last ? null : cur)), 9000);
            phone = ev.phone;
            break;
          }
          case "error": send({ type: "halo", state: "probleme" }); send({ type: "emotion", name: "inquietude" }); sp.push(ev.message); break;
        }
      }, abort.current.signal);
    } catch (e: any) {
      if (e instanceof AuthError) { clearTimeout(filler); endConversation(); return onSignedOut(); }
      if (e?.name !== "AbortError") {
        send({ type: "emotion", name: "inquietude" });
        sp.push(/network|fetch/i.test(e?.message ?? "") ? "Je n'arrive pas à joindre mon serveur. Vérifie la connexion internet." : String(e?.message ?? e));
      }
    }
    clearTimeout(filler);
    sp.end();
    await sp.whenIdle();
    send({ type: "silence" });

    // Actions sur le téléphone : on quitte la conversation (une autre appli s'ouvre)
    if (phone.length) {
      endConversation();
      for (const a of phone) { const err = await perform(a); if (err) await sp.sayNow(err); }
      return;
    }
    if (conversation.current) listen();
    else setPhase("repos");
  }, [endConversation, listen, onSignedOut]);

  // Fin de phrase entendue
  function onHeard(text: string) {
    if (!text) {
      // Silence : la conversation s'arrête doucement
      return endConversation(conversation.current ? "Je reste là si tu as besoin. Touche le bouton pour me parler." : "Je n'ai rien entendu. Touche le bouton et parle-moi.");
    }
    setSubtitle({ who: "toi", text });
    if (GOODBYE.test(text)) { conversation.current = false; setInConversation(false); }
    setCard(cur => (cur?.actionId ? cur : null));
    runTurn((onEvent, signal) => chatStream(text, onEvent, signal));
  }

  onHeardRef.current = onHeard;

  const onMicPress = async () => {
    const p = phaseRef.current;
    if (p === "parole") {                       // interrompre NOÉMIA pour lui parler
      abort.current?.abort();
      await speaker.current.stop();
      send({ type: "silence" });
      conversation.current = true; setInConversation(true);
      return listen();
    }
    if (p === "ecoute") return ear.current!.finish();   // « j'ai fini de parler »
    if (p === "reflexion") return;
    conversation.current = true; setInConversation(true);
    send({ type: "emotion", name: "neutre" });
    listen();
  };

  const onMicLongPress = async () => {
    abort.current?.abort();
    await speaker.current.stop();
    send({ type: "silence" });
    endConversation("À tout à l'heure.");
  };

  const sayLocal = useCallback(async (text: string, emotion = "sourire") => {
    send({ type: "emotion", name: emotion });
    const sp = speaker.current;
    sp.voice = settings.current.voice; sp.rate = settings.current.rate ?? 1;
    await sp.sayNow(text);
    send({ type: "silence" });
    setPhase("repos");
  }, []);

  // Démarrage : réglages, notifications, arrière-plan
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
    if (greeting) sayLocal(greeting);
    else setSubtitle({ who: "noemia", text: "Touche le bouton pour me parler." });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toucher une notification : briefing, bilan…
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !last || handled.current === last.notification.request.identifier) return;
    handled.current = last.notification.request.identifier;
    const action = last.notification.request.content.data?.action;
    if (action === "briefing" || action === "bilan") {
      conversation.current = true; setInConversation(true);
      runTurn((onEvent, signal) => briefingStream(action === "bilan" ? "soir" : "matin", onEvent, signal));
    } else if (action === "email") {
      conversation.current = true; setInConversation(true);
      runTurn((onEvent, signal) => chatStream("Qu'est-ce que c'est que cet email important ?", onEvent, signal));
    }
  }, [last, ready, runTurn]);

  const confirmCard = (yes: boolean) => {
    setCard(null);
    ear.current!.abort();
    conversation.current = true; setInConversation(true);
    const text = yes ? "Oui, vas-y." : "Non, annule.";
    setSubtitle({ who: "toi", text });
    runTurn((onEvent, signal) => chatStream(text, onEvent, signal));
  };

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

      <View style={[st.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {card ? <ActionCard card={card} c={c} onConfirm={() => confirmCard(true)} onCancel={() => confirmCard(false)} /> : null}
        {subtitle.text ? (
          <View style={[st.sub, { backgroundColor: c.panelSoft }]}>
            <Text style={[st.subText, { color: subtitle.who === "toi" ? c.muted : c.ink, fontStyle: subtitle.who === "toi" ? "italic" : "normal" }]}
              accessibilityLiveRegion="polite">
              {subtitle.who === "toi" ? `« ${subtitle.text} »` : subtitle.text}
            </Text>
          </View>
        ) : null}
        <MicButton phase={phase} onPress={onMicPress} onLongPress={onMicLongPress} c={c} />
        <Text style={[st.hint, { color: c.muted }]}>
          {inConversation ? (phase === "parole" ? "Touche pour l'interrompre · appui long pour terminer" : "Conversation en cours · appui long pour terminer") : " "}
        </Text>
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
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", gap: 12 },
  sub: { marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, maxWidth: 420 },
  subText: { fontSize: 17, lineHeight: 24, textAlign: "center" },
  hint: { fontSize: 12, letterSpacing: 0.2 },
});
