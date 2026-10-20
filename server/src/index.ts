// Serveur HTTP de NOÉMIA (derrière Caddy en HTTPS sur le VPS).
import Fastify, { type FastifyRequest } from "fastify";
import { config } from "./config.ts";
import { all, one, run } from "./db.ts";
import { hashToken, newToken, sign, verify, encrypt } from "./crypto.ts";
import { accountsOf, authUrl, exchangeCode } from "./google.ts";
import { turn, resetConversation } from "./agent.ts";
import { listEvents } from "./tools/calendar.ts";
import { search } from "./tools/gmail.ts";

const app = Fastify({ logger: { level: "info" }, trustProxy: true });

// --- Sessions de l'appli ---------------------------------------------------
function userFrom(req: FastifyRequest): number | null {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : (req.query as any)?.session;
  if (!token) return null;
  const row = one("SELECT user_id FROM sessions WHERE token_hash = ?", hashToken(token));
  return row ? Number(row.user_id) : null;
}

app.decorateRequest("userId", 0);
app.addHook("preHandler", async (req, reply) => {
  if (!req.url.startsWith("/api/")) return;
  const id = userFrom(req);
  if (!id) return reply.code(401).send({ error: "Session expirée : reconnecte-toi avec Google." });
  (req as any).userId = id;
});
const uid = (req: FastifyRequest) => (req as any).userId as number;

// --- Connexion Google ------------------------------------------------------
const SAFE_REDIRECT = /^noemia:\/\//;

app.get("/auth/google/start", async (req, reply) => {
  const q = req.query as { redirect?: string; link?: string; hint?: string };
  const redirect = q.redirect && SAFE_REDIRECT.test(q.redirect) ? q.redirect : config.appRedirect;
  let linkUser: number | undefined;
  if (q.link) {
    const row = one("SELECT user_id FROM sessions WHERE token_hash = ?", hashToken(q.link));
    if (!row) return reply.code(401).send("Session invalide");
    linkUser = Number(row.user_id);
  }
  return reply.redirect(authUrl(sign({ redirect, linkUser }), q.hint));
});

app.get("/auth/google/callback", async (req, reply) => {
  const q = req.query as { code?: string; state?: string; error?: string };
  const st = q.state ? verify<{ redirect: string; linkUser?: number }>(q.state) : null;
  if (!st) return reply.code(400).send("Lien de connexion expiré, recommence depuis l'appli.");
  const back = (params: Record<string, string>) => reply.redirect(`${st.redirect}?${new URLSearchParams(params)}`);
  if (q.error || !q.code) return back({ error: q.error ?? "annule" });

  const { tokens, sub, email, name } = await exchangeCode(q.code);
  const existing = one("SELECT id, user_id FROM google_accounts WHERE google_sub = ?", sub);
  let userId: number;

  if (existing) {
    userId = Number(existing.user_id);
    if (tokens.refresh_token) run("UPDATE google_accounts SET refresh_token = ?, email = ? WHERE id = ?", encrypt(tokens.refresh_token), email, existing.id);
  } else {
    if (!tokens.refresh_token) return back({ error: "Google n'a pas donné d'accès durable. Retire NOÉMIA de ton compte Google puis recommence." });
    if (st.linkUser) userId = st.linkUser;
    else userId = Number(run("INSERT INTO users (name) VALUES (?)", name || email.split("@")[0]).lastInsertRowid);
    const count = accountsOf(userId).length;
    run("INSERT INTO google_accounts (user_id, google_sub, email, label, refresh_token, is_primary) VALUES (?, ?, ?, ?, ?, ?)",
      userId, sub, email, count === 0 ? "perso" : "pro", encrypt(tokens.refresh_token), count === 0 ? 1 : 0);
  }

  if (st.linkUser) return back({ linked: email });
  const token = newToken();
  run("INSERT INTO sessions (token_hash, user_id) VALUES (?, ?)", hashToken(token), userId);
  const user = one("SELECT name FROM users WHERE id = ?", userId)!;
  return back({ token, name: user.name });
});

// --- API de l'appli --------------------------------------------------------
app.get("/health", async () => ({ ok: true }));

app.get("/api/me", async req => {
  const id = uid(req);
  const user = one("SELECT name FROM users WHERE id = ?", id)!;
  const settings = JSON.parse(one("SELECT json FROM settings WHERE user_id = ?", id)?.json ?? "{}");
  return { name: user.name, accounts: accountsOf(id), settings };
});

app.post("/api/chat", async req => {
  const { text, tz } = req.body as { text: string; tz?: string };
  if (!text?.trim()) return { reply: "Je n'ai rien entendu.", emotion: "neutre", cards: [], phone: [] };
  return turn(uid(req), text.trim().slice(0, 4000), tz || config.defaultTimezone);
});

app.post("/api/reset", async req => { resetConversation(uid(req)); return { ok: true }; });

app.get("/api/history", async req => {
  const limit = Math.min(Number((req.query as any).limit ?? 100), 500);
  return all("SELECT role, text, at FROM log WHERE user_id = ? ORDER BY id DESC LIMIT ?", uid(req), limit);
});

app.put("/api/settings", async req => {
  run(`INSERT INTO settings (user_id, json) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET json = excluded.json`,
    uid(req), JSON.stringify(req.body ?? {}));
  return { ok: true };
});

app.patch("/api/accounts/:id", async req => {
  const { label } = req.body as { label: string };
  run("UPDATE google_accounts SET label = ? WHERE id = ? AND user_id = ?", label.slice(0, 30), Number((req.params as any).id), uid(req));
  return { ok: true };
});

app.delete("/api/accounts/:id", async (req, reply) => {
  if (accountsOf(uid(req)).length <= 1) return reply.code(400).send({ error: "Garde au moins un compte connecté." });
  run("DELETE FROM google_accounts WHERE id = ? AND user_id = ? AND is_primary = 0", Number((req.params as any).id), uid(req));
  return { ok: true };
});

app.post("/api/logout", async req => {
  const token = req.headers.authorization!.slice(7);
  run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
  return { ok: true };
});

// Pour programmer les rappels de réunion sur le téléphone (notifications locales)
app.get("/api/upcoming", async req => {
  const q = req.query as { hours?: string; tz?: string };
  const tz = q.tz || config.defaultTimezone;
  const from = new Date(), to = new Date(Date.now() + Math.min(Number(q.hours ?? 48), 168) * 3600_000);
  const iso = (d: Date) => d.toISOString();
  return listEvents({ userId: uid(req), tz, cards: [], phone: [] }, iso(from), iso(to));
});

// Vérification en arrière-plan des emails urgents (appelée par l'appli quand iOS la réveille)
app.get("/api/urgent", async req => {
  const tz = (req.query as any).tz || config.defaultTimezone;
  return search({ userId: uid(req), tz, cards: [], phone: [] }, "is:unread is:important newer_than:3h", 5);
});

// Briefing du matin et bilan du soir : NOÉMIA les prépare comme une réponse normale
app.post("/api/briefing", async req => {
  const { kind, tz } = req.body as { kind: "matin" | "soir"; tz?: string };
  const prompt = kind === "soir"
    ? "Fais-moi le bilan de la journée : ce qui s'est passé dans l'agenda, les emails importants restés sans réponse, et ce qui m'attend demain. Reste bref."
    : "Fais-moi mon briefing du matin : les rendez-vous du jour, les emails importants non lus et les tâches qui arrivent à échéance. Reste bref.";
  return turn(uid(req), prompt, tz || config.defaultTimezone);
});

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  reply.code(500).send({ error: "NOÉMIA a rencontré un problème technique. Réessaie dans un instant." });
});

app.listen({ port: config.port, host: config.host }).then(() => app.log.info(`NOÉMIA écoute sur ${config.host}:${config.port}`));
