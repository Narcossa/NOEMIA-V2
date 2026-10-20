// Agenda Google : lecture sur tous les comptes, création/modification/suppression après confirmation.
import { google, type calendar_v3 } from "googleapis";
import { allClients, clientFor } from "../google.ts";
import { prepare, registerExecutor } from "./pending.ts";
import { tool, str, ACCOUNT, type Ctx } from "./types.ts";

const cal = (auth: any) => google.calendar({ version: "v3", auth });

// Référence d'un événement transmise au modèle : compte, agenda, identifiant
const ref = (email: string, calId: string, evId: string) => `${email}::${calId}::${evId}`;
const unref = (r: string) => { const [email, calendarId, eventId] = r.split("::"); return { email, calendarId, eventId }; };

// « 2026-10-21 » = journée entière ; « 2026-10-21T14:00 » = heure locale du fuseau de l'utilisateur
const when = (s: string, tz: string): calendar_v3.Schema$EventDateTime =>
  s.length <= 10 ? { date: s } : { dateTime: s.length === 16 ? s + ":00" : s, timeZone: tz };

export function fmtRange(start?: calendar_v3.Schema$EventDateTime, end?: calendar_v3.Schema$EventDateTime, tz = "Europe/Paris") {
  if (!start) return "";
  if (start.date) return new Date(start.date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + " · journée entière";
  const s = new Date(start.dateTime!), e = end?.dateTime ? new Date(end.dateTime) : null;
  const day = s.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
  const h = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  return `${day} · ${h(s)}${e ? "–" + h(e) : ""}`;
}

// Heure locale (sans décalage) interprétée dans le fuseau tz → instant ISO pour l'API
function toInstant(local: string, tz: string): string {
  if (/[zZ]|[+-]\d\d:\d\d$/.test(local)) return new Date(local).toISOString();
  const guess = new Date(local.length <= 10 ? local + "T00:00:00Z" : local + (local.length === 16 ? ":00Z" : "Z"));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(guess);
  const g = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const asTz = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
  return new Date(guess.getTime() - (asTz - guess.getTime())).toISOString();
}

async function listEvents(ctx: Ctx, from: string, to: string, account?: string) {
  const clients = account ? [clientFor(ctx.userId, account)] : allClients(ctx.userId);
  const out: any[] = [];
  for (const { auth, account: acct } of clients) {
    const cals = (await cal(auth).calendarList.list({ minAccessRole: "reader" })).data.items ?? [];
    for (const c of cals.filter(c => c.selected !== false)) {
      const evs = (await cal(auth).events.list({
        calendarId: c.id!, timeMin: toInstant(from, ctx.tz), timeMax: toInstant(to, ctx.tz),
        singleEvents: true, orderBy: "startTime", maxResults: 50,
      })).data.items ?? [];
      for (const e of evs) out.push({
        ref: ref(acct.email, c.id!, e.id!),
        compte: acct.label, agenda: c.summaryOverride ?? c.summary,
        titre: e.summary ?? "(sans titre)", quand: fmtRange(e.start, e.end, ctx.tz),
        debut: e.start?.dateTime ?? e.start?.date, lieu: e.location,
        participants: e.attendees?.slice(0, 6).map(a => a.displayName ?? a.email),
        lien_visio: e.hangoutLink,
      });
    }
  }
  return out.sort((a, b) => String(a.debut).localeCompare(String(b.debut)));
}

registerExecutor("calendar.create", async (ctx, p) => {
  const { auth } = clientFor(ctx.userId, p.compte);
  const r = await cal(auth).events.insert({ calendarId: p.calendrier ?? "primary", sendUpdates: p.invites?.length ? "all" : "none", requestBody: p.event });
  return `Événement créé : ${r.data.summary} (${fmtRange(r.data.start, r.data.end, ctx.tz)})`;
});
registerExecutor("calendar.update", async (ctx, p) => {
  const { email, calendarId, eventId } = unref(p.ref);
  const { auth } = clientFor(ctx.userId, email);
  const r = await cal(auth).events.patch({ calendarId, eventId, sendUpdates: "all", requestBody: p.changes });
  return `Événement modifié : ${r.data.summary} (${fmtRange(r.data.start, r.data.end, ctx.tz)})`;
});
registerExecutor("calendar.delete", async (ctx, p) => {
  const { email, calendarId, eventId } = unref(p.ref);
  const { auth } = clientFor(ctx.userId, email);
  await cal(auth).events.delete({ calendarId, eventId, sendUpdates: "all" });
  return `Événement supprimé : ${p.titre}`;
});

const DT = "Date « AAAA-MM-JJ » (journée entière) ou date-heure locale « AAAA-MM-JJTHH:MM »";

export const calendarTools = [
  tool("agenda_lister", "Liste les événements de tous les agendas (perso, pro, famille) entre deux dates.",
    { debut: str(DT), fin: str(DT), compte: ACCOUNT }, ["debut", "fin"],
    async (ctx, i) => listEvents(ctx, i.debut, i.fin, i.compte)),

  tool("agenda_preparer_creation", "Prépare la création d'un événement (exécuté après confirmation).",
    { titre: str("Titre"), debut: str(DT), fin: str(DT + ". Par défaut : 1 h après le début"), lieu: str("Lieu"), description: str("Notes"),
      invites: { type: "array", items: { type: "string" }, description: "Adresses e-mail des invités" },
      compte: ACCOUNT, calendrier: str("Identifiant d'agenda (ex. agenda familial) ; par défaut l'agenda principal") },
    ["titre", "debut"],
    async (ctx, i) => {
      const start = when(i.debut, ctx.tz);
      const end = i.fin ? when(i.fin, ctx.tz) : start.date ? { date: i.debut } :
        { dateTime: new Date(new Date(toInstant(i.debut, ctx.tz)).getTime() + 3600_000).toISOString(), timeZone: ctx.tz };
      const event: calendar_v3.Schema$Event = { summary: i.titre, start, end, location: i.lieu, description: i.description,
        attendees: i.invites?.map((email: string) => ({ email })) };
      return prepare(ctx, "calendar.create", { event, compte: i.compte, calendrier: i.calendrier, invites: i.invites }, {
        kind: "evenement", eyebrow: "Agenda · nouvel événement", title: i.titre,
        body: [fmtRange(start, end, ctx.tz), i.lieu, i.invites?.length ? "Invités : " + i.invites.join(", ") : ""].filter(Boolean).join("\n"),
      });
    }),

  tool("agenda_preparer_modification", "Prépare la modification d'un événement existant (ref obtenue via agenda_lister).",
    { ref: str("Référence de l'événement"), titre: str("Nouveau titre"), debut: str(DT), fin: str(DT), lieu: str("Nouveau lieu") },
    ["ref"],
    async (ctx, i) => {
      const changes: calendar_v3.Schema$Event = {};
      if (i.titre) changes.summary = i.titre;
      if (i.debut) changes.start = when(i.debut, ctx.tz);
      if (i.fin) changes.end = when(i.fin, ctx.tz);
      if (i.lieu) changes.location = i.lieu;
      return prepare(ctx, "calendar.update", { ref: i.ref, changes }, {
        kind: "evenement", eyebrow: "Agenda · modification", title: i.titre ?? "Événement modifié",
        body: [changes.start ? fmtRange(changes.start, changes.end, ctx.tz) : "", i.lieu].filter(Boolean).join("\n"),
      });
    }),

  tool("agenda_preparer_suppression", "Prépare la suppression d'un événement (ref obtenue via agenda_lister).",
    { ref: str("Référence de l'événement"), titre: str("Titre de l'événement, pour la confirmation"), quand: str("Date et heure, pour la confirmation") },
    ["ref", "titre"],
    async (ctx, i) => prepare(ctx, "calendar.delete", { ref: i.ref, titre: i.titre }, {
      kind: "suppression", eyebrow: "Agenda · suppression", title: i.titre, body: i.quand,
    })),
];

export { listEvents };
