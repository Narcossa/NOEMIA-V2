// Dialogue avec le serveur NOÉMIA (sur le VPS). Le jeton de session est rangé dans le trousseau iOS.
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { getCalendars } from "expo-localization";
import { fetch as streamFetch } from "expo/fetch";
import { deviceContext } from "./device";
import { Native } from "../modules/noemia-native/src";

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
  | { type: "maps"; destination: string }
  | { type: "reminder"; title: string; due?: string; list?: string }
  | { type: "icloud_event"; title: string; start: string; end?: string; location?: string }
  | { type: "alarm"; at?: string; minutes?: number; label?: string }
  | { type: "camera"; question: string; source: "camera" | "photos" };
export type ImageInput = { data: string; media_type: "image/jpeg" | "image/png" | "image/webp" };
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
export const clearToken = async () => { Native.clearSession(); await SecureStore.deleteItemAsync(TOKEN_KEY); };
// Partage la session avec Siri (« Question rapide ») via le trousseau
export const shareSessionWithSiri = async () => { const t = await getToken(); if (t) Native.setSession(t, API_URL); };

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
  memories: () => call<{ souvenirs: { id: number; text: string; at: string }[]; echanges: { id: number; text: string; at: string }[] }>("/api/memories"),
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
  Native.setSession(token, API_URL);
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

// --- Réponse diffusée au fil de l'eau ------------------------------------------

export type StreamEvent =
  | { type: "emotion"; name: string }
  | { type: "text"; text: string }
  | { type: "status"; tool: string }
  | { type: "done"; emotion: string; cards: Card[]; phone: PhoneAction[]; reply: string }
  | { type: "error"; message: string };

function utf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes, { stream: true } as any);
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return decodeURIComponent(escape(s));
}

async function streamCall(path: string, body: object, onEvent: (e: StreamEvent) => void, signal?: AbortSignal) {
  const token = await getToken();
  if (!token) throw new AuthError("Non connecté");
  // Données de l'iPhone (Santé, lieu, iCloud) : jamais plus d'une seconde et demie d'attente
  const device = await Promise.race([deviceContext().catch(() => undefined), new Promise(r => setTimeout(() => r(undefined), 1500))]);
  const res = await streamFetch(API_URL + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ ...body, tz: timezone(), device }),
    signal,
  });
  if (res.status === 401) { await clearToken(); throw new AuthError("Session expirée"); }
  if (!res.ok || !res.body) throw new Error(`Erreur serveur (${res.status})`);
  const reader = res.body.getReader();
  const decoder = typeof TextDecoder !== "undefined" ? new TextDecoder() : null;
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder ? decoder.decode(value, { stream: true }) : utf8(value);
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line) { try { onEvent(JSON.parse(line)); } catch {} }
    }
  }
}

export const chatStream = (text: string, onEvent: (e: StreamEvent) => void, signal?: AbortSignal, image?: ImageInput) =>
  streamCall("/api/chat/stream", image ? { text, image } : { text }, onEvent, signal);
export const briefingStream = (kind: "matin" | "soir", onEvent: (e: StreamEvent) => void, signal?: AbortSignal) =>
  streamCall("/api/briefing/stream", { kind }, onEvent, signal);
