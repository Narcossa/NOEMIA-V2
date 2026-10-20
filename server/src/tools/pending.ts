// Confirmation orale : les actions qui créent, envoient, modifient ou suppriment ne s'exécutent pas
// tout de suite. Elles sont préparées, affichées en carte, et attendent « oui » (confirm_action).
import { one, run } from "../db.ts";
import { tool, num, type Card, type Ctx } from "./types.ts";

type Executor = (ctx: Ctx, payload: any) => Promise<string>;
const executors = new Map<string, Executor>();

export function registerExecutor(kind: string, fn: Executor) { executors.set(kind, fn); }

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

export const pendingTools = [
  tool("confirm_action",
    "Exécute une action préparée, uniquement après que l'utilisateur a clairement dit oui (oui, vas-y, envoie, c'est bon…).",
    { action_id: num("Identifiant renvoyé lors de la préparation") }, ["action_id"],
    async (ctx, { action_id }) => {
      const a = one("SELECT * FROM pending_actions WHERE id = ? AND user_id = ?", action_id, ctx.userId);
      if (!a) return { erreur: "Action introuvable." };
      if (a.status !== "pending") return { erreur: `Cette action est déjà ${a.status === "done" ? "faite" : "annulée"}.` };
      if (Date.now() - a.created_at > TTL_MS) return { erreur: "Action expirée (plus de 30 minutes) : prépare-la à nouveau." };
      const exec = executors.get(a.kind);
      if (!exec) return { erreur: `Type d'action inconnu : ${a.kind}` };
      const result = await exec(ctx, JSON.parse(a.payload));
      run("UPDATE pending_actions SET status = 'done' WHERE id = ?", action_id);
      run("INSERT INTO log (user_id, role, text) VALUES (?, 'action', ?)", ctx.userId, result);
      return { fait: result };
    }),
  tool("cancel_action", "Annule une action préparée (l'utilisateur a dit non ou a changé d'avis).",
    { action_id: num("Identifiant de l'action") }, ["action_id"],
    async (ctx, { action_id }) => {
      run("UPDATE pending_actions SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'", action_id, ctx.userId);
      return { annule: true };
    }),
];
