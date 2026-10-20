// Rappels et Calendrier natifs de l'iPhone (iCloud). Préparés ici, confirmés à l'oral,
// puis exécutés par l'appli elle-même (le serveur n'a pas accès à iCloud).
import { prepare, registerExecutor } from "./pending.ts";
import { tool, str } from "./types.ts";

registerExecutor("ios.reminder", async (ctx, p) => {
  ctx.phone.push({ type: "reminder", title: p.titre, due: p.echeance, list: p.liste });
  return `Rappel ajouté sur l'iPhone : ${p.titre}`;
});
registerExecutor("ios.event", async (ctx, p) => {
  ctx.phone.push({ type: "icloud_event", title: p.titre, start: p.debut, end: p.fin, location: p.lieu });
  return `Événement ajouté au calendrier de l'iPhone : ${p.titre}`;
});

const when = (s?: string) => s ? new Date(s).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";

export const iosTools = [
  tool("rappel_iphone_preparer",
    "Prépare un rappel dans l'app Rappels de l'iPhone. À privilégier pour « rappelle-moi de… à telle heure » : l'iPhone sonnera à l'heure dite, même appli fermée.",
    { titre: str("Ce qu'il faut rappeler"), echeance: str("Date-heure locale AAAA-MM-JJTHH:MM (optionnel)"), liste: str("Liste de Rappels (optionnel)") },
    ["titre"],
    async (ctx, i) => prepare(ctx, "ios.reminder", i, { kind: "tache", eyebrow: "Rappels iPhone", title: i.titre, body: when(i.echeance) || undefined })),
  tool("evenement_iphone_preparer",
    "Prépare un événement dans le calendrier iCloud de l'iPhone (pour les agendas Google, utilise agenda_preparer_creation).",
    { titre: str("Titre"), debut: str("Date-heure locale AAAA-MM-JJTHH:MM"), fin: str("Date-heure locale de fin (optionnel)"), lieu: str("Lieu") },
    ["titre", "debut"],
    async (ctx, i) => prepare(ctx, "ios.event", i, { kind: "evenement", eyebrow: "Calendrier iPhone", title: i.titre, body: [when(i.debut), i.lieu].filter(Boolean).join(" · ") })),
];
