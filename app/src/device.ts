// Ce que l'iPhone sait et que NOÉMIA peut utiliser : Santé, Calendrier et Rappels iCloud, position.
// Un petit résumé est joint à chaque demande (rien n'est envoyé si l'autorisation n'est pas donnée),
// et l'appli exécute elle-même les actions natives (rappel iCloud, événement iCloud, alarme).
import { Platform } from "react-native";
import * as Calendar from "expo-calendar/legacy";
import * as Location from "expo-location";
import {
  isHealthDataAvailable, queryCategorySamples, queryStatisticsForQuantity, requestAuthorization,
} from "@kingstinct/react-native-healthkit";
import { Native } from "../modules/noemia-native/src";

export type DeviceContext = {
  sante?: { sommeil_heures?: number; pas_aujourdhui?: number; frequence_cardiaque_repos?: number; energie_active_kcal?: number };
  lieu?: { ville?: string; quartier?: string; rue?: string };
  concentration?: { active: boolean; discret: boolean };
  icloud?: { evenements: { titre: string; debut: string; lieu?: string }[]; rappels: { titre: string; echeance?: string; liste?: string }[] };
};

export type Permissions = { sante: boolean; calendrier: boolean; rappels: boolean; position: boolean };

const HEALTH_READ = [
  "HKQuantityTypeIdentifierStepCount",
  "HKQuantityTypeIdentifierRestingHeartRate",
  "HKQuantityTypeIdentifierActiveEnergyBurned",
  "HKCategoryTypeIdentifierSleepAnalysis",
] as const;

// Demande toutes les autorisations d'un coup (depuis le profil ou au premier lancement)
export async function requestAll(): Promise<Permissions> {
  const out: Permissions = { sante: false, calendrier: false, rappels: false, position: false };
  if (Platform.OS !== "ios") return out;
  try { if (isHealthDataAvailable()) out.sante = await requestAuthorization({ toRead: HEALTH_READ as any }); } catch {}
  try { out.calendrier = (await Calendar.requestCalendarPermissionsAsync()).granted; } catch {}
  try { out.rappels = (await Calendar.requestRemindersPermissionsAsync()).granted; } catch {}
  try { out.position = (await Location.requestForegroundPermissionsAsync()).granted; } catch {}
  return out;
}

export async function currentPermissions(): Promise<Permissions> {
  const g = async (f: () => Promise<{ granted: boolean }>) => { try { return (await f()).granted; } catch { return false; } };
  return {
    sante: Platform.OS === "ios" && isHealthDataAvailable(),   // iOS ne dit jamais si la lecture Santé est refusée
    calendrier: await g(Calendar.getCalendarPermissionsAsync),
    rappels: await g(Calendar.getRemindersPermissionsAsync),
    position: await g(Location.getForegroundPermissionsAsync),
  };
}

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const round = (n?: number, k = 0) => (n === undefined || Number.isNaN(n) ? undefined : Math.round(n * 10 ** k) / 10 ** k);
const fmt = (d: Date | string | undefined) => d ? new Date(d).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : undefined;

async function health(): Promise<DeviceContext["sante"]> {
  if (Platform.OS !== "ios" || !isHealthDataAvailable()) return undefined;
  const today = { filter: { date: { startDate: startOfToday(), endDate: new Date() } } };
  const sum = async (id: any, unit: string) =>
    (await queryStatisticsForQuantity(id, ["cumulativeSum"], { ...today, unit } as any).catch(() => null))?.sumQuantity?.quantity;
  const avg = async (id: any, unit: string, days: number) =>
    (await queryStatisticsForQuantity(id, ["discreteAverage"], { filter: { date: { startDate: new Date(Date.now() - days * 864e5), endDate: new Date() } }, unit } as any).catch(() => null))?.averageQuantity?.quantity;

  // Sommeil de la nuit dernière : de 18 h la veille à midi
  let sleep: number | undefined;
  try {
    const from = startOfToday(); from.setHours(-6);
    const to = startOfToday(); to.setHours(12);
    const samples = await queryCategorySamples("HKCategoryTypeIdentifierSleepAnalysis" as any, { limit: 0, filter: { date: { startDate: from, endDate: to } } });
    const asleep = samples.filter((s: any) => [1, 3, 4, 5].includes(Number(s.value)));
    if (asleep.length) sleep = asleep.reduce((t: number, s: any) => t + (new Date(s.endDate).getTime() - new Date(s.startDate).getTime()), 0) / 36e5;
  } catch {}

  const ctx = {
    sommeil_heures: round(sleep, 1),
    pas_aujourdhui: round(await sum("HKQuantityTypeIdentifierStepCount", "count")),
    energie_active_kcal: round(await sum("HKQuantityTypeIdentifierActiveEnergyBurned", "kcal")),
    frequence_cardiaque_repos: round(await avg("HKQuantityTypeIdentifierRestingHeartRate", "count/min", 3)),
  };
  return Object.values(ctx).some(v => v !== undefined) ? ctx : undefined;
}

async function place(): Promise<DeviceContext["lieu"]> {
  try {
    if (!(await Location.getForegroundPermissionsAsync()).granted) return undefined;
    const pos = await Location.getLastKnownPositionAsync({ maxAge: 15 * 60_000 }) ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const [g] = await Location.reverseGeocodeAsync(pos.coords);
    return g ? { ville: g.city ?? undefined, quartier: g.district ?? undefined, rue: g.street ?? undefined } : undefined;
  } catch { return undefined; }
}

async function icloud(): Promise<DeviceContext["icloud"]> {
  const out: NonNullable<DeviceContext["icloud"]> = { evenements: [], rappels: [] };
  try {
    if ((await Calendar.getCalendarPermissionsAsync()).granted) {
      // Agendas propres à l'iPhone (iCloud, Exchange…) : les agendas Google sont déjà lus par le serveur
      const cals = (await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)).filter(c => c.source?.type !== "com.google" && !/gmail|google/i.test(c.source?.name ?? ""));
      if (cals.length) {
        const evs = await Calendar.getEventsAsync(cals.map(c => c.id), new Date(), new Date(Date.now() + 36 * 36e5));
        out.evenements = evs.slice(0, 15).map(e => ({ titre: e.title, debut: fmt(e.startDate)!, lieu: e.location || undefined }));
      }
    }
  } catch {}
  try {
    if ((await Calendar.getRemindersPermissionsAsync()).granted) {
      const lists = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
      const rs = await Calendar.getRemindersAsync(lists.map(l => l.id), Calendar.ReminderStatus.INCOMPLETE, undefined as any, undefined as any);
      const name = new Map(lists.map(l => [l.id, l.title]));
      out.rappels = rs.slice(0, 25).map(r => ({ titre: r.title ?? "", echeance: fmt(r.dueDate as any), liste: name.get(r.calendarId ?? "") }));
    }
  } catch {}
  return out.evenements.length || out.rappels.length ? out : undefined;
}

let cache: { at: number; ctx: DeviceContext } | null = null;

// Résumé envoyé avec chaque demande (mis en cache 2 minutes pour rester rapide)
export async function deviceContext(): Promise<DeviceContext> {
  if (cache && Date.now() - cache.at < 120_000) return cache.ctx;
  const [sante, lieu, ic] = await Promise.all([health(), place(), icloud()]);
  const focus = Native.focusState();
  const ctx: DeviceContext = { sante, lieu, icloud: ic, concentration: focus.actif ? { active: true, discret: focus.discret } : undefined };
  cache = { at: Date.now(), ctx };
  return ctx;
}
export const invalidateDeviceContext = () => { cache = null; };

// --- Actions natives demandées par NOÉMIA ------------------------------------------

export async function addReminder(title: string, due?: string, list?: string): Promise<string | null> {
  if (!(await Calendar.requestRemindersPermissionsAsync()).granted) return "Je n'ai pas accès à tes Rappels. Tu peux l'autoriser dans le profil.";
  const lists = await Calendar.getCalendarsAsync(Calendar.EntityTypes.REMINDER);
  const target = (list && lists.find(l => l.title.toLowerCase().includes(list.toLowerCase()))) || lists.find(l => l.allowsModifications) || lists[0];
  if (!target) return "Je ne trouve aucune liste de Rappels.";
  await Calendar.createReminderAsync(target.id, { title, dueDate: due ? new Date(due) : undefined } as any);
  invalidateDeviceContext();
  return null;
}

export async function addIcloudEvent(title: string, start: string, end?: string, location?: string): Promise<string | null> {
  if (!(await Calendar.requestCalendarPermissionsAsync()).granted) return "Je n'ai pas accès au Calendrier de l'iPhone.";
  const def = await Calendar.getDefaultCalendarAsync();
  const s = new Date(start), e = end ? new Date(end) : new Date(s.getTime() + 3600_000);
  await Calendar.createEventAsync(def.id, { title, startDate: s, endDate: e, location } as any);
  invalidateDeviceContext();
  return null;
}
