// Confirmation : les actions qui créent, envoient, modifient ou suppriment ne s'exécutent pas
// tout de suite. Elles sont préparées et affichées en carte. On les confirme à l'oral (confirm_action)
// ou directement à l'écran, éventuellement après les avoir modifiées (texte de l'email, heure…).
import { one, run } from "../db.ts";
import { tool, num, type Card, type Ctx } from "./types.ts";

type Executor = (ctx: Ctx, payload: any) => Promise<string>;
type Editor = (payload: any, edits: any, ctx: Ctx) => any;
const executors = new Map<string, Executor>();
const editors = new Map<string, Editor>();

export function registerExecutor(kind: string, fn: Executor) { executors.set(kind, fn); }
// Applique les modifications faites à l'écran sur une action préparée
export function registerEditor(kind: string, fn: Editor) { editors.set(kind, fn); }

const TTL_MS = 30 * 60_000;

export function prepare(ctx: Ctx, kind: string, payload: unknown, card: Omit<Card, "actionId">) {
  const r = run("INSERT INTO pending_actions (user_id, kind, payload, card, created_at) VALUES (?, ?, ?, ?, ?)",
    ctx.userId, kind, JSON.stringify(payload), JSON.stringify(card), Date.now());
  const id = Number(r.lastInsertRowid);
  ctx.cards.push({ ...card, actionId: id });
  return {
    statut: "en_attente_de_confirmation",
    action_id: id,
    consigne: "Résume l'action en une phrase et demande confirmation. N'appelle confirm_action qu'après un « oui » explicite.",
  };
}

export class ActionError extends Error {}

export async function executeAction(ctx: Ctx, id: number, edits?: any): Promise<string> {
  const a = one("SELECT * FROM pending_actions WHERE id = ? AND user_id = ?", id, ctx.userId);
  if (!a) throw new ActionError("Action introuvable.");
  if (a.status !== "pending") throw new ActionError(`Cette action est déjà ${a.status === "done" ? "faite" : "annulée"}.`);
  if (Date.now() - a.created_at > TTL_MS) throw new ActionError("Action expirée (plus de 30 minutes) : redemande-la à NOÉMIA.");
  const exec = executors.get(a.kind);
  if (!exec) throw new ActionError(`Type d'action inconnu : ${a.kind}`);
  let payload = JSON.parse(a.payload);
  if (edits && editors.has(a.kind)) payload = editors.get(a.kind)!(payload, edits, ctx);
  const result = await exec(ctx, payload);
  run("UPDATE pending_actions SET status = 'done' WHERE id = ?", id);
  run("INSERT INTO log (user_id, role, text) VALUES (?, 'action', ?)", ctx.userId, result);
  return result;
}

export function cancelAction(userId: number, id: number) {
  run("UPDATE pending_actions SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'", id, userId);
}

export const pendingTools = [
  tool("confirm_action",
    "Exécute une action préparée, uniquement après que l'utilisateur a clairement dit oui (oui, vas-y, envoie, c'est bon…).",
    { action_id: num("Identifiant renvoyé lors de la préparation") }, ["action_id"],
    async (ctx, { action_id }) => {
      try { return { fait: await executeAction(ctx, action_id) }; }
      catch (e) { if (e instanceof ActionError) return { erreur: e.message }; throw e; }
    }),
  tool("cancel_action", "Annule une action préparée (l'utilisateur a dit non ou a changé d'avis).",
    { action_id: num("Identifiant de l'action") }, ["action_id"],
    async (ctx, { action_id }) => { cancelAction(ctx.userId, action_id); return { annule: true }; }),
];
