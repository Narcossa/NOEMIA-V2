import type Anthropic from "@anthropic-ai/sdk";

// Carte affichée par-dessus NOÉMIA (aperçu d'un email, d'un événement…)
export type Card = {
  kind: string;          // email | evenement | tache | suppression | sms | info
  eyebrow: string;       // « Email · brouillon »
  title: string;
  body?: string;
  actionId?: number;     // présent si la carte attend une confirmation
};

// Action que seul le téléphone peut faire (SMS, appel, WhatsApp, Spotify, Raccourcis)
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

export type Ctx = {
  userId: number;
  tz: string;
  cards: Card[];
  phone: PhoneAction[];
};

export type Tool = {
  def: Anthropic.Tool;
  run: (ctx: Ctx, input: any) => Promise<unknown>;
};

export const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[], run: Tool["run"]): Tool => ({
  def: { name, description, input_schema: { type: "object", properties, required } },
  run,
});

export const str = (description: string) => ({ type: "string", description });
export const num = (description: string) => ({ type: "integer", description });
export const bool = (description: string) => ({ type: "boolean", description });
export const ACCOUNT = str("Compte Google à utiliser (e-mail ou libellé « perso » / « pro »). Par défaut : le compte principal.");
