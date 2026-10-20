// Cartes affichées par-dessus NOÉMIA. Certaines se modifient avant confirmation
// (email, rendez-vous, tâches), d'autres se manipulent directement (liste à cocher)
// ou illustrent la réponse (météo, trajet, photo).
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { AppleMaps } from "expo-maps";
import type { Card } from "../api";
import type { Palette } from "../theme";

type Props = {
  card: Card;
  c: Palette;
  onConfirm: (edits?: object) => void;
  onCancel: () => void;
  onCheck?: (task: { id: string; titre: string }) => void;
  onClose: () => void;
};

export function CardView(p: Props) {
  switch (p.card.kind) {
    case "email": return p.card.actionId && p.card.data ? <EmailCard {...p} /> : <Basic {...p} />;
    case "evenement": return p.card.actionId && p.card.data ? <EventCard {...p} /> : <Basic {...p} />;
    case "tache": return p.card.actionId && p.card.data ? <TasksCard {...p} /> : <Basic {...p} />;
    case "liste": return <ChecklistCard {...p} />;
    case "meteo": return <WeatherCard {...p} />;
    case "trajet": return <TripCard {...p} />;
    case "photo": return <PhotoCard {...p} />;
    default: return <Basic {...p} />;
  }
}

function Shell({ card, c, children, onClose }: { card: Card; c: Palette; children: React.ReactNode; onClose?: () => void }) {
  return (
    <View style={[s.card, { backgroundColor: c.panelSoft, borderColor: c.line }]}>
      <View style={s.head}>
        <Text style={[s.eyebrow, { color: c.halo }]}>{card.eyebrow.toUpperCase()}</Text>
        {onClose && !card.actionId ? (
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Fermer la carte">
            <Text style={{ color: c.muted, fontSize: 16 }}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Buttons({ c, confirm, onConfirm, onCancel }: { c: Palette; confirm: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <View style={s.acts}>
      <Pressable onPress={onCancel} style={[s.act, { borderColor: c.line }]} accessibilityRole="button">
        <Text style={[s.actText, { color: c.ink }]}>Annuler</Text>
      </Pressable>
      <Pressable onPress={onConfirm} style={[s.act, { backgroundColor: c.halo, borderColor: c.halo }]} accessibilityRole="button">
        <Text style={[s.actText, { color: "#fff" }]}>{confirm}</Text>
      </Pressable>
    </View>
  );
}

function Basic({ card, c, onConfirm, onCancel, onClose }: Props) {
  return (
    <Shell card={card} c={c} onClose={onClose}>
      <Text style={[s.title, { color: c.ink }]}>{card.title}</Text>
      {card.body ? <Text style={[s.body, { color: c.muted }]} numberOfLines={9} selectable>{card.body}</Text> : null}
      {card.actionId ? <Buttons c={c} confirm={card.kind === "suppression" ? "Supprimer" : "Confirmer"} onConfirm={() => onConfirm()} onCancel={onCancel} /> : null}
    </Shell>
  );
}

// Email : destinataires, sujet et texte modifiables au clavier avant l'envoi
function EmailCard({ card, c, onConfirm, onCancel }: Props) {
  const d = card.data;
  const [sujet, setSujet] = useState<string>(d.sujet);
  const [corps, setCorps] = useState<string>(d.corps);
  const input = [s.input, { color: c.ink, borderColor: c.line, backgroundColor: c.bg }];
  return (
    <Shell card={card} c={c}>
      <Text style={[s.small, { color: c.muted }]}>À : {d.a.join(", ")}</Text>
      <TextInput value={sujet} onChangeText={setSujet} style={input} placeholder="Sujet" placeholderTextColor={c.muted} accessibilityLabel="Sujet de l'email" />
      <TextInput value={corps} onChangeText={setCorps} style={[...input, { minHeight: 110, maxHeight: 220 }]} multiline textAlignVertical="top" accessibilityLabel="Texte de l'email" />
      <Buttons c={c} confirm="Envoyer" onCancel={onCancel}
        onConfirm={() => onConfirm(sujet !== d.sujet || corps !== d.corps ? { sujet, corps } : undefined)} />
    </Shell>
  );
}

// Rendez-vous : titre, lieu et horaires ajustables avec le sélecteur d'iOS
function EventCard({ card, c, onConfirm, onCancel }: Props) {
  const d = card.data;
  const [titre, setTitre] = useState<string>(d.titre);
  const [lieu, setLieu] = useState<string>(d.lieu ?? "");
  const [debut, setDebut] = useState<Date | null>(d.debut ? new Date(d.debut) : null);
  const [fin, setFin] = useState<Date | null>(d.fin ? new Date(d.fin) : null);
  const input = [s.input, { color: c.ink, borderColor: c.line, backgroundColor: c.bg }];
  const local = (x: Date) => {
    const z = new Date(x.getTime() - x.getTimezoneOffset() * 60_000);
    return z.toISOString().slice(0, 16);
  };
  const changed = () => {
    const e: any = {};
    if (titre !== d.titre) e.titre = titre;
    if (lieu !== (d.lieu ?? "")) e.lieu = lieu;
    if (debut && d.debut && debut.getTime() !== new Date(d.debut).getTime()) e.debut = local(debut);
    if (fin && d.fin && fin.getTime() !== new Date(d.fin).getTime()) e.fin = local(fin);
    return Object.keys(e).length ? e : undefined;
  };
  return (
    <Shell card={card} c={c}>
      <TextInput value={titre} onChangeText={setTitre} style={input} accessibilityLabel="Titre de l'événement" />
      {debut ? (
        <View style={s.row}>
          <Text style={[s.small, { color: c.muted, width: 48 }]}>Début</Text>
          <DateTimePicker value={debut} mode="datetime" display="compact" locale="fr-FR" minuteInterval={5}
            onChange={(_, v) => { if (v) { if (fin) setFin(new Date(v.getTime() + (fin.getTime() - debut.getTime()))); setDebut(v); } }} />
        </View>
      ) : <Text style={[s.small, { color: c.muted }]}>Journée entière</Text>}
      {fin ? (
        <View style={s.row}>
          <Text style={[s.small, { color: c.muted, width: 48 }]}>Fin</Text>
          <DateTimePicker value={fin} mode="datetime" display="compact" locale="fr-FR" minuteInterval={5} minimumDate={debut ?? undefined}
            onChange={(_, v) => v && setFin(v)} />
        </View>
      ) : null}
      <TextInput value={lieu} onChangeText={setLieu} style={input} placeholder="Lieu" placeholderTextColor={c.muted} accessibilityLabel="Lieu" />
      <Buttons c={c} confirm="Confirmer" onCancel={onCancel} onConfirm={() => onConfirm(changed())} />
    </Shell>
  );
}

// Ajout de tâches : chaque élément se corrige ou se retire
function TasksCard({ card, c, onConfirm, onCancel }: Props) {
  const [items, setItems] = useState<string[]>(card.data.titres);
  return (
    <Shell card={card} c={c}>
      {items.map((t, i) => (
        <View key={i} style={s.row}>
          <TextInput value={t} onChangeText={v => setItems(x => x.map((y, j) => (j === i ? v : y)))}
            style={[s.input, { flex: 1, color: c.ink, borderColor: c.line, backgroundColor: c.bg, marginTop: 0 }]} />
          <Pressable onPress={() => setItems(x => x.filter((_, j) => j !== i))} hitSlop={10} accessibilityLabel={`Retirer ${t}`}>
            <Text style={{ color: c.muted, fontSize: 18 }}>−</Text>
          </Pressable>
        </View>
      ))}
      <Buttons c={c} confirm="Ajouter" onCancel={onCancel}
        onConfirm={() => onConfirm({ titres: items.map(t => t.trim()).filter(Boolean) })} />
    </Shell>
  );
}

// Liste (courses…) : on coche directement, la tâche est marquée faite dans Google Tasks
function ChecklistCard({ card, c, onCheck, onClose }: Props) {
  const [done, setDone] = useState<Set<string>>(new Set());
  return (
    <Shell card={card} c={c} onClose={onClose}>
      <ScrollView style={{ maxHeight: 260 }}>
        {card.data.taches.map((t: { id: string; titre: string }) => {
          const checked = done.has(t.id);
          return (
            <Pressable key={t.id} style={s.check} accessibilityRole="checkbox" accessibilityState={{ checked }}
              onPress={() => { if (checked) return; setDone(x => new Set(x).add(t.id)); onCheck?.(t); }}>
              <View style={[s.box, { borderColor: c.halo, backgroundColor: checked ? c.halo : "transparent" }]}>
                {checked ? <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>✓</Text> : null}
              </View>
              <Text style={[s.body, { color: checked ? c.muted : c.ink, textDecorationLine: checked ? "line-through" : "none", flex: 1 }]}>{t.titre}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Shell>
  );
}

const SYMBOLES: Record<string, string> = {
  "sun.max.fill": "☀️", "cloud.sun.fill": "⛅", "cloud.fill": "☁️", "cloud.fog.fill": "🌫️",
  "cloud.drizzle.fill": "🌦️", "cloud.rain.fill": "🌧️", "cloud.snow.fill": "🌨️", "cloud.bolt.rain.fill": "⛈️",
};
export const meteoIcone = (i?: string) => SYMBOLES[i ?? ""] ?? "⛅";

function WeatherCard({ card, c, onClose }: Props) {
  const d = card.data;
  return (
    <Shell card={card} c={c} onClose={onClose}>
      <Text style={[s.title, { color: c.ink }]}>{meteoIcone(d.maintenant.icone)} {card.title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 6 }}>
        {d.jours.map((j: any, i: number) => (
          <View key={j.date} style={s.day}>
            <Text style={[s.small, { color: c.muted }]}>
              {i === 0 ? "Auj." : new Date(j.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short" })}
            </Text>
            <Text style={{ fontSize: 22 }}>{meteoIcone(j.icone)}</Text>
            <Text style={[s.small, { color: c.ink, fontVariant: ["tabular-nums"] }]}>{j.max}°</Text>
            <Text style={[s.small, { color: c.muted, fontVariant: ["tabular-nums"] }]}>{j.min}°</Text>
            {j.pluie ? <Text style={[s.tiny, { color: c.halo }]}>{j.pluie} %</Text> : null}
          </View>
        ))}
      </ScrollView>
    </Shell>
  );
}

function TripCard({ card, c, onClose }: Props) {
  const d = card.data;
  return (
    <Shell card={card} c={c} onClose={onClose}>
      <Text style={[s.title, { color: c.ink }]}>{card.title}</Text>
      <View style={s.map}>
        <AppleMaps.View style={{ flex: 1 }}
          cameraPosition={{ coordinates: { latitude: d.lat, longitude: d.lon }, zoom: 13 }}
          markers={[{ id: "dest", coordinates: { latitude: d.lat, longitude: d.lon }, title: d.nom, systemImage: "mappin" }]} />
      </View>
      <Text style={[s.small, { color: c.muted }]}>Arrivée prévue à {d.heure} · {d.minutes} min en voiture</Text>
    </Shell>
  );
}

function PhotoCard({ card, c, onClose }: Props) {
  return (
    <Shell card={card} c={c} onClose={onClose}>
      <Image source={{ uri: card.data.uri }} style={s.photo} resizeMode="cover" accessibilityLabel="Photo montrée à NOÉMIA" />
      {card.body ? <Text style={[s.body, { color: c.muted }]}>{card.body}</Text> : null}
    </Shell>
  );
}

const s = StyleSheet.create({
  card: { alignSelf: "stretch", marginHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  eyebrow: { fontSize: 11, fontWeight: "600", letterSpacing: 1.6 },
  title: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 13 },
  tiny: { fontSize: 11 },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  acts: { flexDirection: "row", gap: 10, marginTop: 10 },
  act: { flex: 1, borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: "center" },
  actText: { fontSize: 15, fontWeight: "600" },
  check: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  day: { alignItems: "center", gap: 2, minWidth: 40 },
  map: { height: 150, borderRadius: 12, overflow: "hidden", marginTop: 4 },
  photo: { width: "100%", height: 180, borderRadius: 12 },
});
