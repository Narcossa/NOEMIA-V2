// Proactivité sans notifications « poussées » (non disponibles avec un identifiant Apple gratuit) :
// l'appli programme elle-même ses notifications locales (briefing, bilan, rappels de réunion)
// et vérifie les emails urgents quand iOS la réveille en arrière-plan.
import * as Notifications from "expo-notifications";
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as SecureStore from "expo-secure-store";
import { api, getToken, type Settings } from "./api";

export const DEFAULTS: Required<Pick<Settings, "briefing" | "bilan" | "reminderMinutes" | "quiet">> = {
  briefing: { enabled: true, hour: 7, minute: 30 },
  bilan: { enabled: true, hour: 19, minute: 0 },
  reminderMinutes: 10,
  quiet: { from: 22, to: 7 },
};

const TASK = "noemia-arriere-plan";
const SEEN_KEY = "noemia.urgent-vus";

// Boutons dans les notifications : « Fait », « Reporter d'une heure », « Lire »…
export async function setupCategories() {
  await Notifications.setNotificationCategoryAsync("rappel", [
    { identifier: "fait", buttonTitle: "Fait", options: { opensAppToForeground: false } },
    { identifier: "reporter", buttonTitle: "Reporter d'une heure", options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync("email", [
    { identifier: "lire", buttonTitle: "Lire avec NOÉMIA", options: { opensAppToForeground: true } },
    { identifier: "reporter", buttonTitle: "Plus tard", options: { opensAppToForeground: false } },
  ]);
  await Notifications.setNotificationCategoryAsync("briefing", [
    { identifier: "ecouter", buttonTitle: "Écouter", options: { opensAppToForeground: true } },
    { identifier: "reporter", buttonTitle: "Dans une heure", options: { opensAppToForeground: false } },
  ]);
}

// « Reporter » : la même notification revient une heure plus tard
Notifications.addNotificationResponseReceivedListener(async r => {
  if (r.actionIdentifier !== "reporter") return;
  const c = r.notification.request.content;
  await Notifications.scheduleNotificationAsync({
    content: { title: c.title ?? "NOÉMIA", body: c.body ?? "", data: c.data ?? {}, categoryIdentifier: (c as any).categoryIdentifier },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3600 },
  });
  await Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const inQuiet = (d: Date, q = DEFAULTS.quiet) => {
  const h = d.getHours();
  return q.from > q.to ? h >= q.from || h < q.to : h >= q.from && h < q.to;
};

export async function askNotificationPermission() {
  await setupCategories().catch(() => {});
  const r = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
  return r.granted;
}

// Reprogramme tout : appelé à l'ouverture de l'appli, après un changement de réglage, et en arrière-plan
export async function reschedule(settings: Settings = {}) {
  const s = { ...DEFAULTS, ...settings };
  await Notifications.cancelAllScheduledNotificationsAsync();

  const daily = async (cfg: { enabled: boolean; hour: number; minute: number }, title: string, body: string, action: string) => {
    if (!cfg.enabled) return;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { action }, categoryIdentifier: "briefing" },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: cfg.hour, minute: cfg.minute },
    });
  };
  await daily(s.briefing, "NOÉMIA", "Ton briefing du matin est prêt. Touche pour l'écouter.", "briefing");
  await daily(s.bilan, "NOÉMIA", "On fait le bilan de la journée ?", "bilan");

  try {
    const events = await api.upcoming();
    for (const e of events) {
      if (!e.debut || e.debut.length <= 10) continue;                 // pas de rappel pour les journées entières
      const at = new Date(new Date(e.debut).getTime() - s.reminderMinutes * 60_000);
      if (at.getTime() < Date.now() + 30_000 || inQuiet(at, s.quiet)) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: e.titre, body: `Dans ${s.reminderMinutes} minutes${e.lieu ? " · " + e.lieu : ""}`, data: { action: "rappel" }, categoryIdentifier: "rappel" },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    }
  } catch {}
}

async function checkUrgent() {
  const mails = await api.urgent();
  const seen = new Set<string>(JSON.parse((await SecureStore.getItemAsync(SEEN_KEY)) ?? "[]"));
  for (const m of mails.filter(m => !seen.has(m.id))) {
    seen.add(m.id);
    if (inQuiet(new Date())) continue;
    const from = m.de.replace(/<.*>/, "").replace(/"/g, "").trim();
    await Notifications.scheduleNotificationAsync({
      content: { title: `Email important de ${from}`, body: m.sujet, data: { action: "email" }, categoryIdentifier: "email" },
      trigger: null,
    });
  }
  await SecureStore.setItemAsync(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
}

TaskManager.defineTask(TASK, async () => {
  try {
    if (!(await getToken())) return BackgroundTask.BackgroundTaskResult.Success;
    await checkUrgent();
    const me = await api.me();
    await reschedule(me.settings);
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackground() {
  try { await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 }); } catch {}
}

export { checkUrgent };
