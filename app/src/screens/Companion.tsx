// Écran principal : NOÉMIA plein écran et une vraie conversation.
// Un appui lance l'échange ; après chaque réponse elle se remet à écouter toute seule.
// Appui pendant qu'elle parle : on l'interrompt et on lui parle. Appui long : fin de la conversation.
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, KeyboardAvoidingView, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Notifications from "expo-notifications";
import { useSpeechRecognitionEvent } from "expo-speech-recognition";
import { Avatar, type AvatarHandle } from "../avatar/Avatar";
import { api, AuthError, briefingStream, chatStream, shareSessionWithSiri, type Card, type ImageInput, type PhoneAction, type Settings, type StreamEvent } from "../api";
import { Native } from "../../modules/noemia-native/src";
import { ensureListenPermission } from "../voice";
import { Speaker } from "../speaker";
import { Ear } from "../ear";
import { perform, startTrip } from "../phone";
import { askNotificationPermission, checkUrgent, registerBackground, reschedule } from "../notifications";
import { useDaylight } from "../theme";
import { CameraIcon, MicButton, ProfileIcon, type Phase } from "../ui";
import { Profile } from "./Profile";
import { CardView } from "../components/Cards";
import { TodayBanner } from "../components/Today";
import { QuickActions, type QuickAction } from "../components/QuickActions";
import { Composer } from "../components/Composer";
import { Thread, type ThreadItem } from "../components/Thread";
import { MeetingMode } from "../components/Meeting";

type Props = { greeting?: string; onSignedOut: () => void };

const GOODBYE = /\b(au revoir|à plus|a plus|bonne nuit|merci c'est tout|c'est tout merci|ce sera tout|rien d'autre|c'est bon merci|tu peux te reposer)\b/i;

// Questions simples auxquelles l'IA de l'iPhone répond instantanément, sans serveur
const SIMPLE = /^(bonjour|salut|coucou|hello|bonsoir|merci( beaucoup)?|ça va|comment (ça|tu) va|quelle heure|on est quel jour|quel jour|raconte(-moi)? une blague|t'es là|tu es là)\b/i;
const LOCAL_INSTRUCTIONS = "Tu es NOÉMIA, la compagne de gestion du quotidien de Mathis : majordome efficace, chaleureuse, avec de l'humour. Tu tutoies, en français, une à deux phrases courtes, sans mise en forme.";

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
  const [composerOpen, setComposerOpen] = useState(false);
  const [threadOpen, setThreadOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const addThread = (who: ThreadItem["who"], text: string, image?: string) =>
    setThread(t => [...t.slice(-199), { id: `${Date.now()}-${Math.random()}`, who, text, image, at: Date.now() }]);
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
  const activity = useRef<string | null>(null);
  const lastQuestion = useRef("");

  useSpeechRecognitionEvent("result", ev => ear.current!.result(ev.results[0]?.transcript ?? ""));
  useSpeechRecognitionEvent("end", () => ear.current!.classicEnded());
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
  const runTurn = useCallback(async (start: (onEvent: (e: StreamEvent) => void, signal: AbortSignal) => Promise<void>, opts: { muted?: boolean } = {}): Promise<void> => {
    setPhase("reflexion");
    send({ type: "emotion", name: "concentration" });
    const sp = speaker.current;
    sp.voice = settings.current.voice; sp.rate = settings.current.rate ?? 1;
    sp.muted = !!opts.muted;
    sp.begin();
    let saidSomething = false;
    let phone: PhoneAction[] = [];
    let reply = "";
    abort.current = new AbortController();
    // Si rien n'arrive vite, un petit mot pour meubler
    const filler = setTimeout(() => { if (!saidSomething) { saidSomething = true; sp.push("Hmm… "); } }, 2200);
    try {
      await start(ev => {
        switch (ev.type) {
          case "emotion": send({ type: "emotion", name: ev.name }); break;
          case "text": if (ev.text.trim()) saidSomething = true; reply += ev.text; sp.push(ev.text); break;
          case "status": if (!saidSomething && STATUS[ev.tool]) { saidSomething = true; sp.push(STATUS[ev.tool] + " "); } break;
          case "done": {
            const last = ev.cards[ev.cards.length - 1] ?? null;
            if (last) setCard(last);
            // Cartes d'information : elles restent un moment, les listes et visuels jusqu'à fermeture
            if (last && !last.actionId && !["liste", "meteo", "trajet", "photo"].includes(last.kind)) setTimeout(() => setCard(cur => (cur === last ? null : cur)), 12000);
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
        const offline = /network|fetch|internet/i.test(e?.message ?? "");
        // Hors connexion : l'IA de l'iPhone prend le relais pour les choses simples
        const local = offline && lastQuestion.current && Native.localModelReady()
          ? await Native.localAnswer(lastQuestion.current, LOCAL_INSTRUCTIONS + " Tu es hors connexion : précise-le si on te demande l'agenda ou les emails.")
          : null;
        sp.push(local ?? (offline ? "Je n'arrive pas à joindre mon serveur. Vérifie la connexion internet." : String(e?.message ?? e)));
      }
    }
    clearTimeout(filler);
    sp.end();
    // Appli passée en arrière-plan pendant la réponse : la Live Activity affiche le résultat
    if (activity.current) {
      Native.updateActivity(activity.current, "fini", reply.trim().slice(0, 160) || "C'est fait.", { endAfterSeconds: 300 });
      activity.current = null;
    }
    await sp.whenIdle();
    send({ type: "silence" });
    if (reply.trim()) addThread("noemia", reply.replace(/\s+/g, " ").trim());
    if (opts.muted) { sp.muted = false; setPhase("repos"); return; }

    // Photo demandée : appareil photo ou photothèque, puis NOÉMIA regarde
    const camera = phone.find(a => a.type === "camera") as Extract<PhoneAction, { type: "camera" }> | undefined;
    if (camera) {
      phone = phone.filter(a => a !== camera);
      const shot = await takePhoto(camera.source);
      if (shot) {
        showPhoto(shot.uri, camera.question);
        return runTurnRef.current((onEvent, signal) => chatStream(camera.question, onEvent, signal, shot.image));
      }
    }

    // Actions natives sans changer d'appli (Rappels, Calendrier iPhone) : la conversation continue
    const inApp: PhoneAction[] = phone.filter(a => a.type === "reminder" || a.type === "icloud_event");
    for (const a of inApp) { const err = await perform(a); if (err) await sp.sayNow(err); }
    // Actions qui ouvrent une autre appli (SMS, WhatsApp, Spotify…) : on termine la conversation
    const external = phone.filter(a => !inApp.includes(a));
    if (external.length) {
      endConversation();
      // Trajet : carte avec la destination et l'heure d'arrivée (et Live Activity)
      const trip = external.find(a => a.type === "maps") as Extract<PhoneAction, { type: "maps" }> | undefined;
      if (trip) {
        const eta = await startTrip(trip.destination).catch(() => null);
        if (eta) setCard({ kind: "trajet", eyebrow: "Trajet", title: `Vers ${eta.nom}`, data: eta });
      }
      for (const a of external) { const err = await perform(a); if (err) await sp.sayNow(err); }
      return;
    }
    if (conversation.current) listen();
    else setPhase("repos");
  }, [endConversation, listen, onSignedOut]);
  const runTurnRef = useRef(runTurn);
  runTurnRef.current = runTurn;

  function showPhoto(uri: string, question: string) {
    addThread("toi", question, uri);
    setCard({ kind: "photo", eyebrow: "Photo", title: "", data: { uri } });
  }

  async function takePhoto(source: "camera" | "photos"): Promise<{ image: ImageInput; uri: string } | null> {
    const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 0.5, base64: true, allowsEditing: false };
    const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { await speaker.current.sayNow("J'ai besoin de l'accès à l'appareil photo. Tu peux l'autoriser dans les Réglages."); return null; }
    const r = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const a = r.canceled ? null : r.assets?.[0];
    if (!a?.base64) return null;
    return { uri: a.uri, image: { data: a.base64, media_type: a.mimeType === "image/png" ? "image/png" : "image/jpeg" } };
  }

  // Fin de phrase entendue
  function onHeard(text: string) {
    if (!text) {
      // Silence : la conversation s'arrête doucement
      return endConversation(conversation.current ? "Je reste là si tu as besoin. Touche le bouton pour me parler." : "Je n'ai rien entendu. Touche le bouton et parle-moi.");
    }
    ask(text);
  }

  // Une question, d'où qu'elle vienne. muted : réponse écrite seulement (question tapée au clavier)
  function ask(text: string, opts: { muted?: boolean } = {}) {
    setSubtitle({ who: "toi", text });
    addThread("toi", text);
    if (GOODBYE.test(text)) { conversation.current = false; setInConversation(false); }
    setCard(cur => (cur?.actionId || cur?.kind === "liste" ? cur : null));
    lastQuestion.current = text;
    if (opts.muted) return runTurn((onEvent, signal) => chatStream(text, onEvent, signal), { muted: true });
    // Réponse instantanée sur l'iPhone pour les échanges simples (salutations, merci, heure…)
    if (SIMPLE.test(text.trim()) && Native.localModelReady()) {
      const now = new Date().toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
      runTurn(async (onEvent, signal) => {
        const answer = await Native.localAnswer(`${text}\n(Nous sommes ${now}.)`, LOCAL_INSTRUCTIONS);
        if (!answer) return chatStream(text, onEvent, signal);
        onEvent({ type: "emotion", name: "sourire" });
        onEvent({ type: "text", text: answer });
      });
      return;
    }
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
        shareSessionWithSiri();
        // Souvenirs et derniers échanges dans la recherche Spotlight de l'iPhone
        api.memories().then(m => Native.indexSpotlight([
          ...m.souvenirs.map(x => ({ id: "s:" + x.text.slice(0, 300), title: x.text.slice(0, 80), content: `Souvenir de NOÉMIA · ${x.at.slice(0, 10)}`, domain: "souvenirs" })),
          ...m.echanges.map(x => ({ id: "s:" + x.text.slice(0, 300), title: x.text.slice(0, 80), content: `Demandé à NOÉMIA le ${x.at.slice(0, 10)}`, domain: "conversations" })),
        ])).catch(() => {});
      } catch (e) { if (e instanceof AuthError) onSignedOut(); }
    })();
  }, [onSignedOut]);

  useEffect(() => {
    if (!ready) return;
    if (greeting) sayLocal(greeting);
    else setSubtitle({ who: "noemia", text: "Touche le bouton pour me parler." });
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Appli quittée pendant que NOÉMIA travaille : Live Activity dans la Dynamic Island
  useEffect(() => {
    const sub = AppState.addEventListener("change", async state => {
      if (state === "background" && (phaseRef.current === "reflexion" || phaseRef.current === "parole") && !activity.current) {
        activity.current = await Native.startActivity("travail", "NOÉMIA", "Je prépare ta réponse…");
      }
      if (state === "active") { await Native.endAllActivities(); activity.current = null; }
    });
    return () => sub.remove();
  }, []);

  // Toucher une notification : briefing, bilan…
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !last || handled.current === last.notification.request.identifier) return;
    handled.current = last.notification.request.identifier;
    if (last.actionIdentifier === "fait" || last.actionIdentifier === "reporter") return;
    const action = last.notification.request.content.data?.action;
    if (action === "briefing" || action === "bilan") {
      conversation.current = true; setInConversation(true);
      runTurn((onEvent, signal) => briefingStream(action === "bilan" ? "soir" : "matin", onEvent, signal));
    } else if (action === "email") {
      conversation.current = true; setInConversation(true);
      runTurn((onEvent, signal) => chatStream("Qu'est-ce que c'est que cet email important ?", onEvent, signal));
    }
  }, [last, ready, runTurn]);

  // Siri, Raccourcis, widget et bouton Action ouvrent NOÉMIA par un lien :
  // noemia://parler · noemia://demander?q=… · noemia://briefing · noemia://bilan
  const handleLink = useCallback((url: string | null | undefined) => {
    if (!url || !url.startsWith("noemia://") || url.startsWith("noemia://auth")) return;
    const u = new URL(url.replace("noemia://", "https://noemia/"));
    const action = u.pathname.replace(/^\//, "") || u.hostname;
    conversation.current = true; setInConversation(true);
    if (action === "spotlight" && u.searchParams.get("id")?.startsWith("s:")) {
      const q = `Parle-moi de ça : ${u.searchParams.get("id")!.slice(2)}`;
      setSubtitle({ who: "toi", text: q });
      runTurn((onEvent, signal) => chatStream(q, onEvent, signal));
    } else if (action === "demander" && u.searchParams.get("q")) {
      const q = u.searchParams.get("q")!;
      setSubtitle({ who: "toi", text: q });
      runTurn((onEvent, signal) => chatStream(q, onEvent, signal));
    } else if (action === "briefing" || action === "bilan") {
      runTurn((onEvent, signal) => briefingStream(action === "bilan" ? "soir" : "matin", onEvent, signal));
    } else listen();
  }, [runTurn, listen]);

  useEffect(() => {
    if (!ready) return;
    Linking.getInitialURL().then(handleLink);
    const sub = Linking.addEventListener("url", e => handleLink(e.url));
    return () => sub.remove();
  }, [ready, handleLink]);

  // Carte confirmée à l'écran (éventuellement modifiée) : exécution directe, sans repasser par la conversation
  const confirmCard = async (edits?: object) => {
    const cur = card;
    if (!cur?.actionId) return;
    setCard(null);
    ear.current!.abort();
    try {
      const r = await api.confirmAction(cur.actionId, edits);
      addThread("action", r.result);
      setSubtitle({ who: "noemia", text: r.result });
      if (!composerOpen) { send({ type: "emotion", name: "sourire" }); await speaker.current.sayNow("C'est fait."); send({ type: "silence" }); setPhase("repos"); }
      for (const a of r.phone) { const err = await perform(a); if (err) setSubtitle({ who: "noemia", text: err }); }
    } catch (e: any) {
      setSubtitle({ who: "noemia", text: e.message });
    }
  };
  const cancelCard = async () => {
    const cur = card;
    setCard(null);
    if (cur?.actionId) { await api.cancelAction(cur.actionId).catch(() => {}); addThread("action", "Annulé"); setSubtitle({ who: "noemia", text: "D'accord, j'annule." }); }
  };
  const checkTask = (t: { id: string; titre: string }) => {
    const d = card?.data;
    if (!d) return;
    api.completeTask(d.liste, t.id, t.titre, d.compte).then(() => addThread("action", `${t.titre} : fait`)).catch(e => setSubtitle({ who: "noemia", text: e.message }));
  };

  async function lookAtPhoto() {
    const shot = await takePhoto("camera");
    if (!shot) return;
    conversation.current = true; setInConversation(true);
    const q = "Qu'est-ce que tu vois ? Dis-moi l'essentiel et ce que je peux en faire.";
    setSubtitle({ who: "toi", text: "Regarde ça." });
    showPhoto(shot.uri, "Regarde ça.");
    runTurn((onEvent, signal) => chatStream(q, onEvent, signal, shot.image));
  }

  const stopEverything = async () => {
    abort.current?.abort();
    ear.current!.abort();
    await speaker.current.stop();
    send({ type: "silence" });
    conversation.current = false; setInConversation(false);
    setPhase("repos");
  };

  const onQuickAction = async (a: QuickAction) => {
    if (a.special === "reunion") { await stopEverything(); return setMeetingOpen(true); }
    if (a.special === "photo") return lookAtPhoto();
    conversation.current = true; setInConversation(true);
    if (a.special === "briefing" || a.special === "bilan") {
      addThread("toi", a.label.replace(/^\S+\s/, ""));
      return runTurn((onEvent, signal) => briefingStream(a.special === "bilan" ? "soir" : "matin", onEvent, signal));
    }
    if (a.ask) ask(a.ask);
  };

  // Glisser vers le haut sur le bas de l'écran : le fil de la conversation
  const swipe = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 14 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderRelease: (_, g) => { if (g.dy < -50) setThreadOpen(true); },
  })).current;

  // Historique récent pour le fil
  useEffect(() => {
    api.history(30).then(h => setThread(cur => cur.length ? cur : h.reverse().map((x, i) => ({
      id: `h${i}`, who: x.role === "toi" ? "toi" : x.role === "action" ? "action" : "noemia", text: x.text,
      at: new Date(x.at.replace(" ", "T") + "Z").getTime(),
    })))).catch(() => {});
  }, []);

  return (
    <View style={[st.root, { backgroundColor: c.bg }]}>
      <Avatar ref={avatar} onReady={() => setReady(true)} />

      <View style={[st.top, { paddingTop: insets.top + 8 }]}>
        <Text style={[st.brand, { color: c.ink }]}>NOÉMIA</Text>
        <View style={st.topRight}>
        <Pressable onPress={async () => {
            lookAtPhoto();
          }} accessibilityRole="button" accessibilityLabel="Montrer quelque chose à NOÉMIA"
          style={[st.iconBtn, { borderColor: c.line, backgroundColor: c.panelSoft }]}>
          <CameraIcon color={c.ink} />
        </Pressable>
        <Pressable onPress={() => setProfileOpen(true)} accessibilityRole="button" accessibilityLabel="Ouvrir le profil"
          style={[st.iconBtn, { borderColor: c.line, backgroundColor: c.panelSoft }]}>
          <ProfileIcon color={c.ink} />
        </Pressable>
        </View>
      </View>
      <View style={[st.today, { top: insets.top + 60 }]}>
        <TodayBanner c={c} onAsk={q => { conversation.current = true; setInConversation(true); ask(q); }} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.bottomWrap} pointerEvents="box-none">
      <View style={[st.bottom, { paddingBottom: composerOpen ? 10 : insets.bottom + 12 }]} {...swipe.panHandlers}>
        {card ? <CardView card={card} c={c} onConfirm={confirmCard} onCancel={cancelCard} onCheck={checkTask} onClose={() => setCard(null)} /> : null}
        {subtitle.text ? (
          <Pressable onPress={() => setThreadOpen(true)} accessibilityRole="button" accessibilityHint="Ouvre le fil de la conversation"
            style={[st.sub, { backgroundColor: c.panelSoft }]}>
            <Text style={[st.subText, { color: subtitle.who === "toi" ? c.muted : c.ink, fontStyle: subtitle.who === "toi" ? "italic" : "normal" }]}
              accessibilityLiveRegion="polite" numberOfLines={6}>
              {subtitle.who === "toi" ? `« ${subtitle.text} »` : subtitle.text}
            </Text>
          </Pressable>
        ) : null}
        {composerOpen ? (
          <Composer c={c} onClose={() => setComposerOpen(false)} onSend={t => { conversation.current = false; setInConversation(false); ask(t, { muted: true }); }} />
        ) : (
          <>
            {!inConversation ? <QuickActions c={c} onPick={onQuickAction} /> : null}
            <View style={st.micRow}>
              <Pressable onPress={async () => { await stopEverything(); setComposerOpen(true); }} accessibilityRole="button" accessibilityLabel="Écrire à NOÉMIA"
                style={[st.sideBtn, { borderColor: c.line, backgroundColor: c.panelSoft }]}>
                <Text style={{ color: c.ink, fontSize: 18 }}>⌨︎</Text>
              </Pressable>
              <MicButton phase={phase} onPress={onMicPress} onLongPress={onMicLongPress} c={c} />
              <Pressable onPress={() => setThreadOpen(true)} accessibilityRole="button" accessibilityLabel="Fil de la conversation"
                style={[st.sideBtn, { borderColor: c.line, backgroundColor: c.panelSoft }]}>
                <Text style={{ color: c.ink, fontSize: 17 }}>☰</Text>
              </Pressable>
            </View>
            <Text style={[st.hint, { color: c.muted }]}>
              {inConversation ? (phase === "parole" ? "Touche pour l'interrompre · appui long pour terminer" : "Conversation en cours · appui long pour terminer") : "Glisse vers le haut pour relire la conversation"}
            </Text>
          </>
        )}
      </View>
      </KeyboardAvoidingView>

      <Thread visible={threadOpen} items={thread} c={c} onClose={() => setThreadOpen(false)}
        onReplay={t => { setThreadOpen(false); speaker.current.sayNow(t).then(() => { send({ type: "silence" }); setPhase("repos"); }); }} />
      <MeetingMode visible={meetingOpen} c={c} onClose={summary => {
        setMeetingOpen(false);
        if (summary) { addThread("noemia", `Compte rendu « ${summary.titre} » : ${summary.resume}`); setSubtitle({ who: "noemia", text: `Compte rendu « ${summary.titre} » prêt. Il est dans le fil.` }); }
      }} />

      <Profile visible={profileOpen} onClose={(s?: Settings) => { setProfileOpen(false); if (s) settings.current = s; }}
        onSignedOut={onSignedOut} c={c} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18 },
  brand: { fontSize: 13, letterSpacing: 4, fontWeight: "500" },
  topRight: { flexDirection: "row", gap: 10 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  today: { position: "absolute", left: 0, right: 0 },
  bottomWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  bottom: { alignItems: "center", gap: 10 },
  micRow: { flexDirection: "row", alignItems: "center", gap: 28 },
  sideBtn: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  sub: { marginHorizontal: 20, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, maxWidth: 420 },
  subText: { fontSize: 17, lineHeight: 24, textAlign: "center" },
  hint: { fontSize: 12, letterSpacing: 0.2 },
});
