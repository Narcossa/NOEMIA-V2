// Mémoire de NOÉMIA : souvenirs durables + recherche dans tout ce qui a été dit.
import { all, ftsQuery, run } from "../db.ts";
import { tool, str } from "./types.ts";

export const memoryTools = [
  tool("memoire_retenir",
    "Retient durablement une information utile sur l'utilisateur ou sa vie (prêt, préférence, habitude, proche, projet). À utiliser aussi de ta propre initiative quand tu apprends quelque chose d'important.",
    { fait: str("L'information, formulée comme une phrase autonome et datée si utile") }, ["fait"],
    async (ctx, { fait }) => { run("INSERT INTO memories (user_id, text) VALUES (?, ?)", ctx.userId, fait); return { retenu: fait }; }),

  tool("memoire_chercher",
    "Cherche dans les souvenirs et dans l'historique des conversations (« qu'est-ce que j'ai dit sur le projet X ? »).",
    { recherche: str("Mots-clés"), depuis: str("Date AAAA-MM-JJ à partir de laquelle chercher dans l'historique (optionnel)") }, ["recherche"],
    async (ctx, { recherche, depuis }) => {
      const q = ftsQuery(recherche);
      if (!q) return { resultat: "Recherche vide." };
      const souvenirs = all(`SELECT m.id, m.text, m.at FROM memories_fts f JOIN memories m ON m.id = f.rowid
        WHERE memories_fts MATCH ? AND m.user_id = ? ORDER BY rank LIMIT 10`, q, ctx.userId);
      const conversations = all(`SELECT l.role, l.text, l.at FROM log_fts f JOIN log l ON l.id = f.rowid
        WHERE log_fts MATCH ? AND l.user_id = ? AND l.at >= ? ORDER BY l.at DESC LIMIT 15`, q, ctx.userId, depuis ?? "0000");
      return { souvenirs, conversations };
    }),

  tool("memoire_oublier", "Oublie un souvenir (l'utilisateur a dit « oublie ça » ou « oublie que… »).",
    { recherche: str("Mots-clés du souvenir à oublier ; « dernier » pour le plus récent") }, ["recherche"],
    async (ctx, { recherche }) => {
      const rows = recherche.trim().toLowerCase() === "dernier"
        ? all("SELECT id, text FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT 1", ctx.userId)
        : all(`SELECT m.id, m.text FROM memories_fts f JOIN memories m ON m.id = f.rowid WHERE memories_fts MATCH ? AND m.user_id = ? ORDER BY rank LIMIT 3`, ftsQuery(recherche), ctx.userId);
      for (const r of rows) run("DELETE FROM memories WHERE id = ?", r.id);
      return rows.length ? { oublie: rows.map(r => r.text) } : { resultat: "Aucun souvenir correspondant." };
    }),
];

// Souvenirs injectés dans le contexte de chaque conversation (les plus récents)
export const recentMemories = (userId: number, n = 60) =>
  all("SELECT text, at FROM memories WHERE user_id = ? ORDER BY id DESC LIMIT ?", userId, n).reverse();
