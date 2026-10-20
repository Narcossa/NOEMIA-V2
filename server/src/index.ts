// Serveur HTTP de NOÉMIA (derrière Caddy en HTTPS sur le VPS).
import Fastify, { type FastifyRequest } from "fastify";
import { config } from "./config.ts";
import { all, one, run } from "./db.ts";
import { hashToken, newToken, sign, verify, encrypt } from "./crypto.ts";
import { accountsOf, authUrl, exchangeCode } from "./google.ts";
import { turn, resetConversation, type ImageInput, type DocumentInput } from "./agent.ts";
import { listEvents } from "./tools/calendar.ts";
import { search } from "./tools/gmail.ts";

const app = Fastify({ logger: { level: "info" }, trustProxy: true, bodyLimit: 20 * 1024 * 1024 });

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

// --- Pages publiques (exigées par Google pour l'écran de consentement) ------
const page = (title: string, body: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#141922}h1{font-weight:400;letter-spacing:.04em}</style>
</head><body>${body}</body></html>`;

app.get("/", async (_req, reply) => reply.type("text/html").send(page("NOÉMIA", `
<h1>NOÉMIA</h1><p>Compagnon vocal privé de gestion du quotidien, réservé à la famille de Mathis Gosselin (NOEM).
Cette application n'est pas publique.</p><p><a href="/confidentialite">Règles de confidentialité</a></p>`)));

app.get("/confidentialite", async (_req, reply) => reply.type("text/html").send(page("NOÉMIA · Confidentialité", `
<h1>Règles de confidentialité</h1>
<p>NOÉMIA est une application privée, utilisée uniquement par Mathis Gosselin et sa famille.</p>
<p><b>Données Google utilisées :</b> agenda, tâches, emails et contacts des comptes que l'utilisateur connecte lui-même.
Elles servent uniquement à répondre à ses demandes (lire, résumer, créer un événement, envoyer un email après confirmation).</p>
<p><b>Stockage :</b> les jetons d'accès Google sont chiffrés sur un serveur privé (OVH). L'historique des conversations et les souvenirs
de l'assistant y sont conservés et peuvent être effacés à la demande (« oublie ça », déconnexion du compte).</p>
<p><b>Partage :</b> aucune donnée n'est vendue ni partagée. Le texte des demandes est transmis à Anthropic (Claude) pour être compris,
sans être utilisé pour entraîner des modèles.</p>
<p><b>Révocation :</b> l'accès peut être retiré à tout moment sur https://myaccount.google.com/permissions.</p>
<p>Contact : mathis.gosselin.noem@gmail.com</p>`)));

// --- API de l'appli --------------------------------------------------------
app.get("/health", async () => ({ ok: true }));

app.get("/api/me", async req => {
  const id = uid(req);
  const user = one("SELECT name FROM users WHERE id = ?", id)!;
  const settings = JSON.parse(one("SELECT json FROM settings WHERE user_id = ?", id)?.json ?? "{}");
  return { name: user.name, accounts: accountsOf(id), settings };
});

app.post("/api/chat", async req => {
  const { text, tz, channel, image, document } = req.body as { text: string; tz?: string; channel?: string; image?: ImageInput; document?: DocumentInput };
  if (!text?.trim()) return { reply: "Je n'ai rien entendu.", emotion: "neutre", cards: [], phone: [] };
  // Siri, montre et partage : réponses courtes, sans action à confirmer sur place
  const prefix = channel === "siri" || channel === "montre" || channel === "partage" ? "[Via Siri] " : "";
  const img = image?.data && /^image\/(jpeg|png|webp)$/.test(image.media_type) ? image : undefined;
  const doc = document?.data && document.media_type === "application/pdf" ? document : undefined;
  return turn(uid(req), prefix + text.trim().slice(0, 16000), tz || config.defaultTimezone, undefined, undefined, img, doc);
});

// Souvenirs et derniers échanges, indexés dans Spotlight par l'appli
app.get("/api/memories", async req => ({
  souvenirs: all("SELECT id, text, at FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT 200", uid(req)),
  echanges: all("SELECT id, role, text, at FROM log WHERE user_id = ? AND role = 'toi' ORDER BY id DESC LIMIT 100", uid(req)),
}));

// Version diffusée : une ligne JSON par événement (texte au fil de l'eau, expression, outil en cours),
// pour que l'appli commence à parler dès la première phrase.
async function streamTurn(req: FastifyRequest, reply: any, text: string, tz: string, device?: Record<string, unknown>, image?: ImageInput) {
  reply.hijack();
  reply.raw.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache", "x-accel-buffering": "no" });
  const send = (o: object) => reply.raw.write(JSON.stringify(o) + "\n");
  try {
    const r = await turn(uid(req), text, tz, send, device, image);
    send({ type: "done", emotion: r.emotion, cards: r.cards, phone: r.phone, reply: r.reply });
  } catch (err: any) {
    req.log.error(err);
    send({ type: "error", message: "NOÉMIA a rencontré un problème technique. Réessaie dans un instant." });
  }
  reply.raw.end();
}

app.post("/api/chat/stream", async (req, reply) => {
  const { text, tz, device, image } = req.body as { text: string; tz?: string; device?: Record<string, unknown>; image?: ImageInput };
  const img = image?.data && /^image\/(jpeg|png|webp)$/.test(image.media_type) && image.data.length < 7_000_000 ? image : undefined;
  return streamTurn(req, reply, (text ?? "").trim().slice(0, 4000) || "…", tz || config.defaultTimezone, device, img);
});

app.post("/api/briefing/stream", async (req, reply) => {
  const { kind, tz, device } = req.body as { kind: "matin" | "soir"; tz?: string; device?: Record<string, unknown> };
  return streamTurn(req, reply, kind === "soir" ? BILAN : BRIEFING, tz || config.defaultTimezone, device);
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
const BRIEFING = "Fais-moi mon briefing du matin : les rendez-vous du jour, les emails importants non lus et les tâches qui arrivent à échéance. Reste bref.";
const BILAN = "Fais-moi le bilan de la journée : ce qui s'est passé dans l'agenda, les emails importants restés sans réponse, et ce qui m'attend demain. Reste bref.";
app.post("/api/briefing", async req => {
  const { kind, tz } = req.body as { kind: "matin" | "soir"; tz?: string };
  return turn(uid(req), kind === "soir" ? BILAN : BRIEFING, tz || config.defaultTimezone);
});

app.setErrorHandler((err, req, reply) => {
  req.log.error(err);
  reply.code(500).send({ error: "NOÉMIA a rencontré un problème technique. Réessaie dans un instant." });
});

app.listen({ port: config.port, host: config.host }).then(() => app.log.info(`NOÉMIA écoute sur ${config.host}:${config.port}`));
