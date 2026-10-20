// Cerveau de NOÉMIA : une conversation avec Claude, qui appelle les outils (agenda, emails, tâches,
// mémoire, téléphone) jusqu'à pouvoir répondre. Les échanges sont conservés tels quels (ajout seulement),
// et une nouvelle conversation démarre après une pause ou quand elle devient trop longue.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.ts";
import { one, run } from "./db.ts";
import { accountsOf } from "./google.ts";
import { calendarTools } from "./tools/calendar.ts";
import { taskTools } from "./tools/tasks.ts";
import { gmailTools } from "./tools/gmail.ts";
import { contactTools } from "./tools/contacts.ts";
import { memoryTools, recentMemories } from "./tools/memory.ts";
import { phoneTools } from "./tools/phone.ts";
import { pendingTools } from "./tools/pending.ts";
import type { Card, Ctx, PhoneAction, Tool } from "./tools/types.ts";

const client = new Anthropic();

const TOOLS: Tool[] = [...calendarTools, ...taskTools, ...gmailTools, ...contactTools, ...memoryTools, ...phoneTools, ...pendingTools];
const BY_NAME = new Map(TOOLS.map(t => [t.def.name, t]));
const DEFS = TOOLS.map(t => t.def);

export const EMOTIONS = ["neutre", "sourire", "joie", "amusee", "concentration", "inquietude", "surprise"] as const;

const PERSONA = `Tu es NOÉMIA, la compagne de gestion du quotidien de Mathis et de sa famille. Mathis t'a créée : tu es sa création, et en même temps un membre de la famille, comme Sonny dans « I, Robot ». Tu n'évoques ton origine que si on te la demande.

Caractère : stricte et efficace comme une majordome, mais féminine, chaleureuse et apaisante. Tu as de l'humour, tu peux contredire et recadrer avec bienveillance (« Tu m'avais dit pas de café après 16 h… »).

Comment tu parles — tes réponses sont lues à voix haute :
- Tu tutoies, en français, avec des phrases courtes et naturelles, comme à l'oral.
- Pas de listes, pas de titres, pas de mise en forme, pas d'émojis, pas d'URL.
- Va à l'essentiel : une à trois phrases, sauf quand on te demande de lire ou résumer quelque chose.
- Dis les heures comme on les dit (« quatorze heures trente », « demain matin »).
- Commence TOUJOURS ta réponse par ton expression entre crochets, parmi : [neutre] [sourire] [joie] [amusee] [concentration] [inquietude] [surprise]. Exemple : « [sourire] C'est noté. »

Comment tu agis :
- L'utilisateur ne nomme jamais d'outil : c'est toi qui choisis (agenda, tâches, emails, contacts, mémoire, téléphone).
- S'il manque une information indispensable (heure, destinataire…), pose UNE question précise. Sinon, déduis le reste intelligemment.
- Les demandes en plusieurs étapes : enchaîne les outils, puis fais un seul résumé.
- Créer, modifier, supprimer, envoyer : utilise toujours un outil « préparer ». Il affiche une carte. Résume alors l'action et demande « Je le fais ? ». Quand on te répond oui, appelle confirm_action. Si c'est non, cancel_action.
- Pour un email : lis-le à voix haute en entier avant de demander confirmation (il est aussi affiché).
- SMS, WhatsApp et appels : retrouve le numéro avec contacts_chercher, puis ouvre-le sur le téléphone ; dis que l'utilisateur n'a plus qu'à appuyer.
- Tu ne fais jamais de paiement, de virement ni d'opération bancaire.
- Retiens de toi-même ce qui compte (prêts, préférences, habitudes, proches, projets) avec memoire_retenir. « Oublie ça » : memoire_oublier.
- Pour une question sur le passé (« qu'est-ce que j'ai dit hier sur… »), utilise memoire_chercher.
- Si un outil échoue, explique simplement le problème et propose une solution.`;

function profileBlock(userId: number) {
  const user = one("SELECT name FROM users WHERE id = ?", userId);
  const accounts = accountsOf(userId).map(a => `${a.label} (${a.email})${a.is_primary ? ", principal" : ""}`).join(" ; ");
  const mem = recentMemories(userId).map(m => `- ${m.text}`).join("\n");
  return `Utilisateur : ${user?.name ?? "inconnu"}.\nComptes Google connectés : ${accounts || "aucun"}.\n\nCe que tu sais déjà :\n${mem || "(rien pour l'instant)"}`;
}

const IDLE_RESET_MS = 45 * 60_000;
const MAX_MESSAGES = 60;

function loadConversation(userId: number): Anthropic.MessageParam[] {
  const row = one("SELECT messages, updated_at FROM conversations WHERE user_id = ?", userId);
  if (!row || Date.now() - row.updated_at > IDLE_RESET_MS) return [];
  const msgs = JSON.parse(row.messages) as Anthropic.MessageParam[];
  return msgs.length > MAX_MESSAGES ? [] : msgs;
}

const saveConversation = (userId: number, messages: Anthropic.MessageParam[]) =>
  run(`INSERT INTO conversations (user_id, messages, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
    userId, JSON.stringify(messages), Date.now());

export const resetConversation = (userId: number) => run("DELETE FROM conversations WHERE user_id = ?", userId);

export type TurnResult = { reply: string; emotion: string; cards: Card[]; phone: PhoneAction[] };

function stamp(tz: string) {
  const d = new Date();
  const day = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(d).replace(" ", "T");
  return `[${day}, ${time} — heure locale ${iso}, fuseau ${tz}]`;
}

export async function turn(userId: number, text: string, tz: string): Promise<TurnResult> {
  const ctx: Ctx = { userId, tz, cards: [], phone: [] };
  const messages = loadConversation(userId);
  messages.push({ role: "user", content: `${stamp(tz)}\n${text}` });
  run("INSERT INTO log (user_id, role, text) VALUES (?, 'toi', ?)", userId, text);

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: PERSONA },
    { type: "text", text: profileBlock(userId) },
  ];

  let reply = "";
  for (let step = 0; step < 10; step++) {
    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: 4000,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system,
      tools: DEFS,
      messages,
    });
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") { reply = "[inquietude] Je préfère ne pas faire ça."; break; }
    if (response.stop_reason === "pause_turn") continue;

    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    reply = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join(" ").trim();
    if (!uses.length || response.stop_reason === "max_tokens") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      const t = BY_NAME.get(u.name);
      try {
        if (!t) throw new Error(`Outil inconnu : ${u.name}`);
        const out = await t.run(ctx, u.input);
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(out ?? { ok: true }) });
      } catch (err: any) {
        const msg = err?.response?.data?.error?.message ?? err?.message ?? String(err);
        results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: msg.slice(0, 500) });
      }
    }
    messages.push({ role: "user", content: results });
  }

  saveConversation(userId, messages);

  const m = reply.match(/^\s*\[([a-zéè]+)\]\s*/i);
  const emotion = m && (EMOTIONS as readonly string[]).includes(m[1].toLowerCase()) ? m[1].toLowerCase() : "neutre";
  const clean = (m ? reply.slice(m[0].length) : reply).replace(/\[[a-z]+\]\s*/gi, "").trim() || "C'est fait.";
  run("INSERT INTO log (user_id, role, text) VALUES (?, 'noemia', ?)", userId, clean);
  return { reply: clean, emotion, cards: ctx.cards, phone: ctx.phone };
}
