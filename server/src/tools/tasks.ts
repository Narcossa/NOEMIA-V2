// Google Tasks : listes (courses, à faire…) et tâches. Ajout et validation après confirmation.
import { google } from "googleapis";
import { clientFor } from "../google.ts";
import { prepare, registerExecutor } from "./pending.ts";
import { tool, str, ACCOUNT, type Ctx } from "./types.ts";

const api = (auth: any) => google.tasks({ version: "v1", auth });

async function findList(ctx: Ctx, name?: string, account?: string, create = false) {
  const { auth } = clientFor(ctx.userId, account);
  const lists = (await api(auth).tasklists.list({ maxResults: 100 })).data.items ?? [];
  if (!name) return { auth, list: lists[0] };
  const n = name.toLowerCase();
  let list = lists.find(l => l.title?.toLowerCase() === n) ?? lists.find(l => l.title?.toLowerCase().includes(n));
  if (!list && create) list = (await api(auth).tasklists.insert({ requestBody: { title: name } })).data;
  return { auth, list };
}

registerExecutor("tasks.add", async (ctx, p) => {
  const { auth, list } = await findList(ctx, p.liste, p.compte, true);
  for (const title of p.titres) {
    await api(auth).tasks.insert({ tasklist: list!.id!, requestBody: { title, notes: p.notes, due: p.echeance ? p.echeance + "T00:00:00.000Z" : undefined } });
  }
  return `Ajouté à « ${list!.title} » : ${p.titres.join(", ")}`;
});

registerExecutor("tasks.complete", async (ctx, p) => {
  const { auth, list } = await findList(ctx, p.liste, p.compte);
  await api(auth).tasks.patch({ tasklist: list!.id!, task: p.id, requestBody: { status: "completed" } });
  return `Tâche terminée : ${p.titre}`;
});

export const taskTools = [
  tool("taches_lister", "Liste les listes de tâches, ou les tâches non terminées d'une liste (courses, à faire…).",
    { liste: str("Nom de la liste ; vide = toutes les listes avec leurs tâches"), compte: ACCOUNT }, [],
    async (ctx, i) => {
      const { auth } = clientFor(ctx.userId, i.compte);
      const lists = (await api(auth).tasklists.list({ maxResults: 100 })).data.items ?? [];
      const wanted = i.liste ? lists.filter(l => l.title?.toLowerCase().includes(i.liste.toLowerCase())) : lists;
      const out = [];
      for (const l of wanted) {
        const tasks = (await api(auth).tasks.list({ tasklist: l.id!, showCompleted: false, maxResults: 100 })).data.items ?? [];
        out.push({ liste: l.title, taches: tasks.map(t => ({ id: t.id, titre: t.title, echeance: t.due?.slice(0, 10), notes: t.notes })) });
      }
      return out;
    }),

  tool("taches_preparer_ajout", "Prépare l'ajout d'une ou plusieurs tâches à une liste (créée si elle n'existe pas).",
    { titres: { type: "array", items: { type: "string" }, description: "Une entrée par tâche ou article" },
      liste: str("Nom de la liste (ex. « Courses »). Par défaut : la liste principale"),
      echeance: str("Échéance AAAA-MM-JJ"), notes: str("Notes"), compte: ACCOUNT },
    ["titres"],
    async (ctx, i) => prepare(ctx, "tasks.add", i, {
      kind: "tache", eyebrow: `Tâches · ${i.liste ?? "liste principale"}`, title: i.titres.join(", "),
      body: i.echeance ? `Échéance : ${new Date(i.echeance + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}` : undefined,
    })),

  tool("taches_preparer_fin", "Prépare le passage d'une tâche à « terminée » (id obtenu via taches_lister).",
    { id: str("Identifiant de la tâche"), titre: str("Titre, pour la confirmation"), liste: str("Nom de la liste"), compte: ACCOUNT },
    ["id", "titre", "liste"],
    async (ctx, i) => prepare(ctx, "tasks.complete", i, { kind: "tache", eyebrow: "Tâches · terminée", title: i.titre })),
];
