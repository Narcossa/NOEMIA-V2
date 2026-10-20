// Accès JavaScript au module natif de NOÉMIA. Chaque fonction est sans risque :
// si le module ou la fonction iOS n'existe pas (ancien iOS, Expo Go), elle renvoie une valeur neutre.
import { requireOptionalNativeModule, type EventSubscription } from "expo-modules-core";

type TranscriptEvent = { text: string; isFinal: boolean };

type Native = {
  setSession(token: string, apiUrl: string): void;
  clearSession(): void;
  focusState(): { discret: boolean; actif: boolean };
  indexSpotlight(items: { id: string; title: string; content?: string; domain?: string }[]): Promise<void>;
  liveActivitiesEnabled(): boolean;
  startActivity(kind: string, titre: string, detail: string, fin: string | null): Promise<string | null>;
  updateActivity(id: string, etat: string, detail: string, fin: string | null, endAfterSeconds: number | null): Promise<void>;
  endAllActivities(): Promise<void>;
  tripEstimate(destination: string): Promise<{ nom: string; arrivee: string; minutes: number; lat: number; lon: number }>;
  alarmKitAvailable(): boolean;
  scheduleAlarm(at: string | null, seconds: number | null, label: string): Promise<boolean>;
  localModelStatus(): string;
  localAnswer(prompt: string, instructions: string): Promise<string>;
  analyzerAvailable(): boolean;
  startAnalyzer(locale: string): Promise<void>;
  stopAnalyzer(): Promise<void>;
  addListener(event: "onTranscript", cb: (e: TranscriptEvent) => void): EventSubscription;
  addListener(event: "onTranscriptEnd", cb: (e: { text: string }) => void): EventSubscription;
  addListener(event: "onTranscriptError", cb: (e: { message: string }) => void): EventSubscription;
};

const N = requireOptionalNativeModule<Native>("NoemiaNative");

const safe = <T>(f: () => T, fallback: T): T => { try { return N ? f() : fallback; } catch { return fallback; } };
const safeAsync = async <T>(f: () => Promise<T>, fallback: T): Promise<T> => { try { return N ? await f() : fallback; } catch { return fallback; } };

export const Native = {
  available: !!N,
  setSession: (token: string, apiUrl: string) => safe(() => N!.setSession(token, apiUrl), undefined),
  clearSession: () => safe(() => N!.clearSession(), undefined),
  focusState: () => safe(() => N!.focusState(), { discret: false, actif: false }),
  indexSpotlight: (items: Parameters<Native["indexSpotlight"]>[0]) => safeAsync(() => N!.indexSpotlight(items), undefined),
  liveActivitiesEnabled: () => safe(() => N!.liveActivitiesEnabled(), false),
  startActivity: (kind: string, titre: string, detail: string, fin?: Date) =>
    safeAsync(() => N!.startActivity(kind, titre, detail, fin ? fin.toISOString() : null), null),
  updateActivity: (id: string, etat: string, detail: string, opts: { fin?: Date; endAfterSeconds?: number } = {}) =>
    safeAsync(() => N!.updateActivity(id, etat, detail, opts.fin ? opts.fin.toISOString() : null, opts.endAfterSeconds ?? null), undefined),
  endAllActivities: () => safeAsync(() => N!.endAllActivities(), undefined),
  tripEstimate: (destination: string) => safeAsync(() => N!.tripEstimate(destination), null),
  alarmKitAvailable: () => safe(() => N!.alarmKitAvailable(), false),
  scheduleAlarm: (at: Date | null, seconds: number | null, label: string) =>
    safeAsync(() => N!.scheduleAlarm(at ? at.toISOString() : null, seconds, label), false),
  localModelReady: () => safe(() => N!.localModelStatus() === "disponible", false),
  localAnswer: (prompt: string, instructions: string) => safeAsync(() => N!.localAnswer(prompt, instructions), null as string | null),
  analyzerAvailable: () => safe(() => N!.analyzerAvailable(), false),
  startAnalyzer: (locale = "fr-FR") => N!.startAnalyzer(locale),
  stopAnalyzer: () => safeAsync(() => N!.stopAnalyzer(), undefined),
  onTranscript: (cb: (e: TranscriptEvent) => void) => N?.addListener("onTranscript", cb),
  onTranscriptEnd: (cb: (e: { text: string }) => void) => N?.addListener("onTranscriptEnd", cb),
  onTranscriptError: (cb: (e: { message: string }) => void) => N?.addListener("onTranscriptError", cb),
};
