// Dialogue avec le serveur NOÉMIA (sur le VPS). Le jeton de session est rangé dans le trousseau iOS.
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { getCalendars } from "expo-localization";

export const API_URL = "https://vps-1d994dff.vps.ovh.ca";
const REDIRECT = "noemia://auth";
const TOKEN_KEY = "noemia.session";

export const timezone = () => getCalendars()[0]?.timeZone ?? "Europe/Paris";

export type Card = { kind: string; eyebrow: string; title: string; body?: string; actionId?: number };
export type PhoneAction =
  | { type: "sms"; to: string; body: string }
  | { type: "call"; to: string }
  | { type: "whatsapp"; to: string; text: string }
  | { type: "spotify"; query: string }
  | { type: "shortcut"; name: string; input?: string }
  | { type: "maps"; destination: string };
export type Turn = { reply: string; emotion: string; cards: Card[]; phone: PhoneAction[] };
export type Account = { id: number; email: string; label: string; is_primary: number };
export type Settings = {
  briefing?: { enabled: boolean; hour: number; minute: number };
  bilan?: { enabled: boolean; hour: number; minute: number };
  reminderMinutes?: number;
  quiet?: { from: number; to: number };   // heures pleines, ex. 22 → 7
  voice?: string;
  rate?: number;
};
export type Me = { name: string; accounts: Account[]; settings: Settings };

export const getToken = () => SecureStore.getItemAsync(TOKEN_KEY);
export const clearToken = () => SecureStore.deleteItemAsync(TOKEN_KEY);

export class AuthError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new AuthError("Non connecté");
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  if (res.status === 401) { await clearToken(); throw new AuthError("Session expirée"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Erreur serveur (${res.status})`);
  return data as T;
}

export const api = {
  me: () => call<Me>("/api/me"),
  chat: (text: string) => call<Turn>("/api/chat", { method: "POST", body: JSON.stringify({ text, tz: timezone() }) }),
  briefing: (kind: "matin" | "soir") => call<Turn>("/api/briefing", { method: "POST", body: JSON.stringify({ kind, tz: timezone() }) }),
  reset: () => call("/api/reset", { method: "POST", body: "{}" }),
  history: (limit = 80) => call<{ role: string; text: string; at: string }[]>(`/api/history?limit=${limit}`),
  saveSettings: (s: Settings) => call("/api/settings", { method: "PUT", body: JSON.stringify(s) }),
  renameAccount: (id: number, label: string) => call(`/api/accounts/${id}`, { method: "PATCH", body: JSON.stringify({ label }) }),
  removeAccount: (id: number) => call(`/api/accounts/${id}`, { method: "DELETE" }),
  upcoming: () => call<{ titre: string; debut: string; quand: string; lieu?: string }[]>(`/api/upcoming?hours=48&tz=${encodeURIComponent(timezone())}`),
  urgent: () => call<{ id: string; de: string; sujet: string }[]>(`/api/urgent?tz=${encodeURIComponent(timezone())}`),
  logout: async () => { await call("/api/logout", { method: "POST", body: "{}" }).catch(() => {}); await clearToken(); },
};

// Connexion Google : le navigateur sécurisé d'iOS s'ouvre, puis revient dans l'appli avec un jeton
export async function signInWithGoogle(): Promise<{ name: string } | null> {
  const r = await WebBrowser.openAuthSessionAsync(`${API_URL}/auth/google/start?redirect=${encodeURIComponent(REDIRECT)}`, REDIRECT);
  if (r.type !== "success") return null;
  const params = new URL(r.url).searchParams;
  const error = params.get("error");
  if (error) throw new Error(error === "annule" ? "Connexion annulée." : error);
  const token = params.get("token");
  if (!token) return null;
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  return { name: params.get("name") ?? "" };
}

// Ajouter un second compte Google (ex. NOEM) au même profil
export async function linkGoogleAccount(): Promise<string | null> {
  const token = await getToken();
  if (!token) return null;
  const r = await WebBrowser.openAuthSessionAsync(
    `${API_URL}/auth/google/start?redirect=${encodeURIComponent(REDIRECT)}&link=${encodeURIComponent(token)}`, REDIRECT);
  if (r.type !== "success") return null;
  const params = new URL(r.url).searchParams;
  if (params.get("error")) throw new Error(params.get("error")!);
  return params.get("linked");
}
