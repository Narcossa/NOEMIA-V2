// Connexion Google (OAuth côté serveur) et accès aux API par compte.
// Les jetons ne quittent jamais le serveur : l'appli ne reçoit qu'un jeton de session NOÉMIA.
import { google } from "googleapis";
import { config } from "./config.ts";
import { all, one, run } from "./db.ts";
import { decrypt, encrypt } from "./crypto.ts";

export const SCOPES = [
  "openid", "email", "profile",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/contacts.other.readonly",
];

export const REDIRECT_URI = () => `${config.publicUrl}/auth/google/callback`;

export const oauthClient = () =>
  new google.auth.OAuth2(config.google.clientId, config.google.clientSecret, REDIRECT_URI());

export function authUrl(state: string, loginHint?: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: SCOPES,
    state,
    login_hint: loginHint,
    include_granted_scopes: true,
  });
}

export async function exchangeCode(code: string) {
  const client = oauthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error("Google n'a pas renvoyé d'identité");
  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.google.clientId });
  const p = ticket.getPayload()!;
  return { tokens, sub: p.sub, email: p.email ?? "", name: p.given_name ?? p.name ?? "" };
}

export type Account = { id: number; email: string; label: string; is_primary: number };

export const accountsOf = (userId: number) =>
  all("SELECT id, email, label, is_primary FROM google_accounts WHERE user_id = ? ORDER BY is_primary DESC, id", userId) as Account[];

// Client authentifié pour un compte (par e-mail ou libellé ; compte principal par défaut)
export function clientFor(userId: number, which?: string) {
  const accts = accountsOf(userId);
  const w = which?.toLowerCase().trim();
  const acct = (w && accts.find(a => a.email.toLowerCase() === w || a.label.toLowerCase() === w)) || accts[0];
  if (!acct) throw new Error("Aucun compte Google connecté");
  const row = one("SELECT refresh_token FROM google_accounts WHERE id = ?", acct.id)!;
  const auth = oauthClient();
  auth.setCredentials({ refresh_token: decrypt(row.refresh_token) });
  auth.on("tokens", t => {
    if (t.refresh_token) run("UPDATE google_accounts SET refresh_token = ? WHERE id = ?", encrypt(t.refresh_token), acct.id);
  });
  return { auth, account: acct };
}

export const allClients = (userId: number) => accountsOf(userId).map(a => clientFor(userId, a.email));
