// Gmail : recherche et lecture sur tous les comptes ; envoi et réponse après confirmation.
import { google, type gmail_v1 } from "googleapis";
import { allClients, clientFor } from "../google.ts";
import { prepare, registerEditor, registerExecutor } from "./pending.ts";
import { tool, str, num, ACCOUNT, type Ctx } from "./types.ts";

const api = (auth: any) => google.gmail({ version: "v1", auth });
const header = (m: gmail_v1.Schema$Message, name: string) =>
  m.payload?.headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

function bodyText(part?: gmail_v1.Schema$MessagePart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const p of part.parts ?? []) { const t = bodyText(p); if (t) return t; }
  if (part.mimeType === "text/html" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  return "";
}

// En-tête RFC 2047 pour les accents dans le sujet et les noms
const enc = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`;

function rawEmail(from: string, to: string[], subject: string, body: string, inReplyTo?: string, refs?: string) {
  const lines = [
    `From: ${from}`, `To: ${to.join(", ")}`, `Subject: ${enc(subject)}`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64",
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${refs ? refs + " " : ""}${inReplyTo}`] : []),
    "", Buffer.from(body, "utf8").toString("base64"),
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

registerExecutor("gmail.send", async (ctx, p) => {
  const { auth, account } = clientFor(ctx.userId, p.compte);
  let threadId: string | undefined, inReplyTo: string | undefined, refs: string | undefined;
  if (p.reponse_a) {
    const orig = (await api(auth).users.messages.get({ userId: "me", id: p.reponse_a, format: "metadata", metadataHeaders: ["Message-ID", "References"] })).data;
    threadId = orig.threadId ?? undefined;
    inReplyTo = header(orig, "Message-ID"); refs = header(orig, "References");
  }
  await api(auth).users.messages.send({ userId: "me", requestBody: { threadId, raw: rawEmail(account.email, p.a, p.sujet, p.corps, inReplyTo, refs) } });
  return `Email envoyé à ${p.a.join(", ")} : « ${p.sujet} »`;
});

registerEditor("gmail.send", (p, e) => ({ ...p, sujet: e.sujet ?? p.sujet, corps: e.corps ?? p.corps, a: e.a ?? p.a }));

export async function search(ctx: Ctx, q: string, max: number, account?: string) {
  const clients = account ? [clientFor(ctx.userId, account)] : allClients(ctx.userId);
  const out: any[] = [];
  for (const { auth, account: acct } of clients) {
    const ids = (await api(auth).users.messages.list({ userId: "me", q, maxResults: max })).data.messages ?? [];
    for (const { id } of ids) {
      const m = (await api(auth).users.messages.get({ userId: "me", id: id!, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] })).data;
      out.push({ id, compte: acct.label, de: header(m, "From"), sujet: header(m, "Subject"), date: header(m, "Date"),
        extrait: m.snippet, non_lu: m.labelIds?.includes("UNREAD") ?? false, important: m.labelIds?.includes("IMPORTANT") ?? false });
    }
  }
  return out;
}

export const gmailTools = [
  tool("emails_chercher", "Cherche des emails sur tous les comptes avec la syntaxe Gmail (ex. « is:unread newer_than:1d », « from:sophie », « subject:devis »).",
    { requete: str("Requête Gmail"), max: num("Nombre maximum par compte (défaut 10)"), compte: ACCOUNT }, ["requete"],
    async (ctx, i) => search(ctx, i.requete, Math.min(i.max ?? 10, 25), i.compte)),

  tool("email_lire", "Lit le contenu complet d'un email (id obtenu via emails_chercher).",
    { id: str("Identifiant de l'email"), compte: ACCOUNT }, ["id"],
    async (ctx, i) => {
      const { auth } = clientFor(ctx.userId, i.compte);
      const m = (await api(auth).users.messages.get({ userId: "me", id: i.id, format: "full" })).data;
      return { de: header(m, "From"), a: header(m, "To"), sujet: header(m, "Subject"), date: header(m, "Date"),
        texte: bodyText(m.payload).trim().slice(0, 8000) };
    }),

  tool("email_preparer", "Prépare un email (nouveau ou réponse). Il sera lu à voix haute, affiché, puis envoyé après confirmation.",
    { a: { type: "array", items: { type: "string" }, description: "Adresses e-mail des destinataires" },
      sujet: str("Sujet"), corps: str("Texte complet, signé « Mathis » sauf indication contraire"),
      reponse_a: str("Id de l'email auquel on répond (optionnel)"), compte: ACCOUNT },
    ["a", "sujet", "corps"],
    async (ctx, i) => prepare(ctx, "gmail.send", i, {
      kind: "email", eyebrow: i.reponse_a ? "Email · réponse" : "Email · brouillon", title: "À : " + i.a.join(", "),
      body: `${i.sujet}\n\n${i.corps}`,
      data: { a: i.a, sujet: i.sujet, corps: i.corps },
    })),
];
