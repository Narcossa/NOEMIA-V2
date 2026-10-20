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
import { iosTools } from "./tools/ios.ts";
import type { Card, Ctx, PhoneAction, Tool } from "./tools/types.ts";

const client = new Anthropic();

const TOOLS: Tool[] = [...calendarTools, ...taskTools, ...gmailTools, ...contactTools, ...memoryTools, ...phoneTools, ...iosTools, ...pendingTools];
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
- Avant d'aller chercher une information (agenda, emails…), dis d'abord une très courte phrase naturelle (« Je regarde ça. », « Une seconde, je vérifie ton agenda. »), puis utilise l'outil : la conversation reste vivante pendant que tu travailles.

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
- Si un outil échoue, explique simplement le problème et propose une solution.

Données de l'iPhone :
- Chaque message peut être précédé d'un bloc « [iPhone : …] » : sommeil de la nuit, pas du jour, fréquence cardiaque au repos, lieu actuel, agenda iCloud et Rappels de l'iPhone. Utilise-les avec tact et seulement quand c'est utile (« Tu as peu dormi, je t'allège la matinée ? »). Ne les récite jamais sans raison.
- « Rappelle-moi de… à 18 h » : rappel_iphone_preparer (l'iPhone sonnera). Les listes partagées ou pro restent dans les tâches Google.
- Si le bloc iPhone indique « concentration » avec « discret » : réponses très brèves, pas de bavardage.
- Quand on te montre une photo (devis, chantier, objet, document), décris l'essentiel, puis propose l'action utile (ajouter au devis, créer une tâche, envoyer par email…).

Via Siri (message commençant par « [Via Siri] ») : réponds en une ou deux phrases, sans préparer d'action à confirmer ; si une action est nécessaire, dis simplement d'ouvrir NOÉMIA pour la confirmer.`;

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

// Événements diffusés à l'appli pendant que NOÉMIA réfléchit et parle
export type TurnEvent =
  | { type: "emotion"; name: string }
  | { type: "text"; text: string }
  | { type: "status"; tool: string };

function stamp(tz: string) {
  const d = new Date();
  const day = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz });
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz });
  const iso = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(d).replace(" ", "T");
  return `[${day}, ${time} — heure locale ${iso}, fuseau ${tz}]`;
}

// Retire les balises d'expression « [sourire] » du flux de texte et les signale à part
function tagFilter(emit: (e: TurnEvent) => void) {
  let buf = "";
  let firstEmotion: string | null = null;
  const flushText = (t: string) => { if (t) emit({ type: "text", text: t }); };
  return {
    push(delta: string) {
      buf += delta;
      while (buf) {
        const i = buf.indexOf("[");
        if (i === -1) { flushText(buf); buf = ""; return; }
        if (i > 0) { flushText(buf.slice(0, i)); buf = buf.slice(i); }
        const j = buf.indexOf("]");
        if (j === -1) { if (buf.length > 24) { flushText(buf); buf = ""; } return; }
        const tag = buf.slice(1, j).toLowerCase();
        if ((EMOTIONS as readonly string[]).includes(tag)) {
          firstEmotion ??= tag;
          emit({ type: "emotion", name: tag });
          buf = buf.slice(j + 1).replace(/^\s+/, "");
        } else { flushText(buf.slice(0, j + 1)); buf = buf.slice(j + 1); }
      }
    },
    end() { flushText(buf); buf = ""; return firstEmotion; },
  };
}

// Résumé des données de l'iPhone joint à la demande (sommeil, pas, lieu, agenda iCloud…)
function deviceBlock(device?: Record<string, unknown>) {
  if (!device || !Object.values(device).some(Boolean)) return "";
  return `\n[iPhone : ${JSON.stringify(device).slice(0, 3000)}]`;
}

export type ImageInput = { data: string; media_type: "image/jpeg" | "image/png" | "image/webp" };

export async function turn(userId: number, text: string, tz: string, emit: (e: TurnEvent) => void = () => {}, device?: Record<string, unknown>, image?: ImageInput): Promise<TurnResult> {
  const ctx: Ctx = { userId, tz, cards: [], phone: [] };
  const messages = loadConversation(userId);
  const body = `${stamp(tz)}${deviceBlock(device)}\n${text}`;
  // Photo jointe (appareil photo, photothèque) : envoyée à Claude avec la question
  messages.push({ role: "user", content: image
    ? [{ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } }, { type: "text", text: body }]
    : body });
  run("INSERT INTO log (user_id, role, text) VALUES (?, 'toi', ?)", userId, text);

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: PERSONA },
    { type: "text", text: profileBlock(userId) },
  ];

  let spoken = "";
  let emotion: string | null = null;
  const filter = tagFilter(e => {
    if (e.type === "text") spoken += e.text;
    emit(e);
  });

  for (let step = 0; step < 10; step++) {
    const stream = client.messages.stream({
      model: config.anthropicModel,
      max_tokens: 4000,
      output_config: { effort: "low" },
      cache_control: { type: "ephemeral" },
      system,
      tools: DEFS,
      messages,
    });
    stream.on("text", delta => filter.push(delta));
    const response = await stream.finalMessage();
    emotion ??= filter.end();
    if (spoken && !/\s$/.test(spoken)) { spoken += " "; emit({ type: "text", text: " " }); }
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") { const r = "Je préfère ne pas faire ça."; spoken += r; emit({ type: "text", text: r }); break; }
    if (response.stop_reason === "pause_turn") continue;

    const uses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (!uses.length || response.stop_reason === "max_tokens") break;

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const u of uses) {
      emit({ type: "status", tool: u.name });
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
  const clean = spoken.replace(/\s+/g, " ").trim() || "C'est fait.";
  if (!spoken.trim()) emit({ type: "text", text: clean });
  run("INSERT INTO log (user_id, role, text) VALUES (?, 'noemia', ?)", userId, clean);
  return { reply: clean, emotion: emotion ?? "neutre", cards: ctx.cards, phone: ctx.phone };
}
