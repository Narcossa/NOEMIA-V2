// Chiffrement des jetons Google (AES-256-GCM) et jetons de session de l'appli.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config.ts";

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", config.secretKey, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map(s => Buffer.from(s, "base64url"));
  const d = createDecipheriv("aes-256-gcm", config.secretKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

export const newToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

// Paramètre « state » signé pour le parcours OAuth (anti-falsification)
export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify({ ...payload, ts: Date.now() })).toString("base64url");
  const mac = createHmac("sha256", config.secretKey).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verify<T>(signed: string, maxAgeMs = 10 * 60_000): T | null {
  const [body, mac] = signed.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", config.secretKey).update(body).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  const data = JSON.parse(Buffer.from(body, "base64url").toString());
  return Date.now() - data.ts > maxAgeMs ? null : data;
}
