// Profil : comptes Google, voix, notifications, heures de silence, historique, déconnexion.
import { useEffect, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api, linkGoogleAccount, type Me, type Settings } from "../api";
import { frenchVoices, say, type VoiceInfo } from "../voice";
import { DEFAULTS, reschedule } from "../notifications";
import { currentPermissions, requestAll, type Permissions } from "../device";
import type { Palette } from "../theme";

type Props = { visible: boolean; onClose: (s?: Settings) => void; onSignedOut: () => void; c: Palette };

const hh = (h: number, m = 0) => `${h} h${m ? String(m).padStart(2, "0") : ""}`;

export function Profile({ visible, onClose, onSignedOut, c }: Props) {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<Me | null>(null);
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [history, setHistory] = useState<{ role: string; text: string; at: string }[] | null>(null);
  const [error, setError] = useState("");
  const [perms, setPerms] = useState<Permissions | null>(null);

  const load = async () => {
    try {
      const m = await api.me();
      setMe(m);
      setSettings({ ...DEFAULTS, ...m.settings });
      setVoices(await frenchVoices());
      setPerms(await currentPermissions());
      setError("");
    } catch (e: any) { setError(e.message); }
  };
  useEffect(() => { if (visible) { load(); setHistory(null); } }, [visible]);

  const update = (patch: Settings) => setSettings(s => ({ ...s, ...patch }));

  const close = async () => {
    try { await api.saveSettings(settings); await reschedule(settings); } catch {}
    onClose(settings);
  };

  const addAccount = async () => {
    try { const email = await linkGoogleAccount(); if (email) await load(); }
    catch (e: any) { Alert.alert("Ajout impossible", e.message); }
  };

  const T = (p: { children: React.ReactNode; muted?: boolean }) =>
    <Text style={{ color: p.muted ? c.muted : c.ink, fontSize: p.muted ? 13 : 15 }}>{p.children}</Text>;
  const Group = ({ title }: { title: string }) => <Text style={[st.group, { color: c.muted }]}>{title.toUpperCase()}</Text>;
  const Row = ({ children, onPress }: { children: React.ReactNode; onPress?: () => void }) => (
    <Pressable onPress={onPress} disabled={!onPress} style={[st.row, { borderColor: c.line }]}>{children}</Pressable>
  );
  const Stepper = ({ value, onChange, min, max, step = 1, fmt }: { value: number; onChange: (v: number) => void; min: number; max: number; step?: number; fmt: (v: number) => string }) => (
    <View style={st.stepper}>
      <Pressable onPress={() => onChange(Math.max(min, value - step))} style={[st.stepBtn, { borderColor: c.line }]} accessibilityLabel="Moins"><T>−</T></Pressable>
      <Text style={{ color: c.ink, minWidth: 64, textAlign: "center", fontVariant: ["tabular-nums"] }}>{fmt(value)}</Text>
      <Pressable onPress={() => onChange(Math.min(max, value + step))} style={[st.stepBtn, { borderColor: c.line }]} accessibilityLabel="Plus"><T>+</T></Pressable>
    </View>
  );

  const b = settings.briefing ?? DEFAULTS.briefing, e = settings.bilan ?? DEFAULTS.bilan, q = settings.quiet ?? DEFAULTS.quiet;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[st.root, { backgroundColor: c.panel }]}>
        <View style={[st.head, { borderColor: c.line }]}>
          <Text style={[st.title, { color: c.ink }]}>Profil</Text>
          <Pressable onPress={close} accessibilityRole="button"><Text style={{ color: c.halo, fontSize: 16, fontWeight: "600" }}>Fermer</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 40 }}>
          {error ? <Text style={{ color: c.danger, marginBottom: 10 }}>{error}</Text> : null}
          {me ? <Text style={[st.hello, { color: c.ink }]}>{me.name}</Text> : null}

          <Group title="Comptes Google" />
          {me?.accounts.map(a => (
            <Row key={a.id} onPress={a.is_primary ? undefined : () => Alert.alert(a.email, "Que veux-tu faire ?", [
              { text: "Renommer en « pro »", onPress: () => api.renameAccount(a.id, "pro").then(load) },
              { text: "Déconnecter ce compte", style: "destructive", onPress: () => api.removeAccount(a.id).then(load) },
              { text: "Annuler", style: "cancel" },
            ])}>
              <View style={{ flex: 1 }}><T>{a.email}</T><T muted>{a.label}{a.is_primary ? " · principal" : ""}</T></View>
            </Row>
          ))}
          <Row onPress={addAccount}><T>+ Ajouter un compte Google</T></Row>
          <Text style={[st.note, { color: c.muted }]}>Agenda, tâches, emails et contacts de chaque compte sont accessibles à NOÉMIA.</Text>

          <Group title="Voix" />
          {voices.length === 0 ? <Text style={[st.note, { color: c.muted }]}>Aucune voix française trouvée.</Text> : null}
          {voices.slice(0, 8).map(v => {
            const selected = (settings.voice ?? voices[0]?.identifier) === v.identifier;
            return (
              <Row key={v.identifier} onPress={() => { update({ voice: v.identifier }); say("Voici ma voix. Elle te plaît ?", { voice: v.identifier, rate: settings.rate }); }}>
                <View style={{ flex: 1 }}><T>{v.name}</T><T muted>{v.quality === "Enhanced" ? "Haute qualité" : "Standard"} · {v.language}</T></View>
                {selected ? <Text style={{ color: c.halo, fontWeight: "700" }}>✓</Text> : null}
              </Row>
            );
          })}
          <Text style={[st.note, { color: c.muted }]}>Pour une voix plus naturelle : Réglages › Accessibilité › Contenu énoncé › Voix › Français, télécharge Aurélie ou Marie en version « Améliorée ».</Text>
          <Row><T>Vitesse</T><Stepper value={Math.round((settings.rate ?? 1) * 100)} min={80} max={120} step={5} fmt={v => `${v} %`} onChange={v => update({ rate: v / 100 })} /></Row>

          <Group title="Notifications" />
          <Row><T>Briefing du matin</T><Switch value={b.enabled} onValueChange={v => update({ briefing: { ...b, enabled: v } })} /></Row>
          {b.enabled ? <Row><T muted>Heure</T><Stepper value={b.hour * 60 + b.minute} min={300} max={660} step={15} fmt={v => hh(Math.floor(v / 60), v % 60)} onChange={v => update({ briefing: { ...b, hour: Math.floor(v / 60), minute: v % 60 } })} /></Row> : null}
          <Row><T>Bilan du soir</T><Switch value={e.enabled} onValueChange={v => update({ bilan: { ...e, enabled: v } })} /></Row>
          {e.enabled ? <Row><T muted>Heure</T><Stepper value={e.hour * 60 + e.minute} min={960} max={1380} step={15} fmt={v => hh(Math.floor(v / 60), v % 60)} onChange={v => update({ bilan: { ...e, hour: Math.floor(v / 60), minute: v % 60 } })} /></Row> : null}
          <Row><T>Rappel avant réunion</T><Stepper value={settings.reminderMinutes ?? 10} min={5} max={60} step={5} fmt={v => `${v} min`} onChange={v => update({ reminderMinutes: v })} /></Row>

          <Group title="iPhone" />
          {perms ? (["sante", "calendrier", "rappels", "position"] as const).map(k => (
            <Row key={k}><T>{{ sante: "Santé", calendrier: "Calendrier", rappels: "Rappels", position: "Position" }[k]}</T>
              <T muted>{perms[k] ? "autorisé" : "non autorisé"}</T></Row>
          )) : null}
          <Row onPress={async () => setPerms(await requestAll())}><Text style={{ color: c.halo, fontSize: 15 }}>Autoriser l'accès aux données de l'iPhone</Text></Row>
          <Text style={[st.note, { color: c.muted }]}>NOÉMIA lit ton sommeil, tes pas, ta position, ton agenda iCloud et tes Rappels pour mieux t'aider. Elle peut aussi créer des Rappels qui sonnent sur l'iPhone. Tu peux tout retirer dans Réglages › Confidentialité.</Text>

          <Group title="Siri et raccourcis" />
          <Text style={[st.note, { color: c.muted, marginTop: 0 }]}>Dis « Dis Siri, parle à NOÉMIA », « Dis Siri, demande à NOÉMIA » ou « Dis Siri, briefing NOÉMIA ». Tu peux aussi associer « Parler à NOÉMIA » au bouton Action (Réglages › Bouton Action › Raccourci) et ajouter le widget NOÉMIA sur l'écran d'accueil ou de verrouillage.</Text>

          <Group title="Heures de silence" />
          <Row><T>De</T><Stepper value={q.from} min={18} max={23} fmt={v => hh(v)} onChange={v => update({ quiet: { ...q, from: v } })} /></Row>
          <Row><T>À</T><Stepper value={q.to} min={5} max={10} fmt={v => hh(v)} onChange={v => update({ quiet: { ...q, to: v } })} /></Row>
          <Text style={[st.note, { color: c.muted }]}>Pas de rappel ni d'alerte email pendant ces heures. Les emails urgents arrivent avec un peu de retard : iOS décide quand NOÉMIA peut vérifier en arrière-plan.</Text>

          <Group title="Historique" />
          {history === null ? (
            <Row onPress={() => api.history().then(setHistory).catch(err => setError(err.message))}><T>Afficher les derniers échanges</T></Row>
          ) : history.map((h, i) => (
            <View key={i} style={[st.hist, { borderColor: c.line }]}>
              <T muted>{h.role === "toi" ? "Toi" : h.role === "noemia" ? "NOÉMIA" : "Action"} · {new Date(h.at.replace(" ", "T") + "Z").toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</T>
              <T>{h.text}</T>
            </View>
          ))}
          <Row onPress={() => api.reset().then(() => Alert.alert("C'est fait", "NOÉMIA repart d'une conversation neuve. Ses souvenirs sont conservés."))}>
            <T>Nouvelle conversation</T>
          </Row>

          <Group title="Compte" />
          <Row onPress={() => Alert.alert("Se déconnecter ?", "Tu devras te reconnecter avec Google.", [
            { text: "Annuler", style: "cancel" },
            { text: "Déconnexion", style: "destructive", onPress: async () => { await api.logout(); onClose(); onSignedOut(); } },
          ])}>
            <Text style={{ color: c.danger, fontSize: 15 }}>Déconnexion</Text>
          </Row>
        </ScrollView>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 18, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { fontSize: 22, fontWeight: "400", letterSpacing: 0.5 },
  hello: { fontSize: 18, fontWeight: "500", marginBottom: 4 },
  group: { fontSize: 11, fontWeight: "600", letterSpacing: 1.6, marginTop: 26, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
  note: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  hist: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
