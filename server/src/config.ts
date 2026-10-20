// Réglages du serveur, lus dans les variables d'environnement (fichier .env sur le VPS, jamais dans git).

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement manquante : ${name} (voir server/.env.example)`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  host: process.env.HOST ?? "127.0.0.1",
  // Adresse publique HTTPS du serveur, ex. https://vps-1d994dff.vps.ovh.ca
  publicUrl: required("PUBLIC_URL").replace(/\/$/, ""),
  // Schéma de l'appli iPhone pour le retour de connexion Google
  appRedirect: process.env.APP_REDIRECT ?? "noemia://auth",
  dataDir: process.env.DATA_DIR ?? "./data",
  // 32 octets en base64 : chiffre les jetons Google et signe les sessions
  secretKey: Buffer.from(required("SECRET_KEY"), "base64"),
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-haiku-5-5",
  google: {
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
  },
  defaultTimezone: process.env.DEFAULT_TZ ?? "Europe/Paris",
};

if (config.secretKey.length !== 32) throw new Error("SECRET_KEY doit faire 32 octets encodés en base64");
