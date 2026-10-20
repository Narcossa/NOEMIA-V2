// Actions que seul le téléphone peut faire. Le serveur ne les exécute pas : il les renvoie à l'appli,
// qui ouvre le bon écran (iOS impose un appui de l'utilisateur pour envoyer un SMS ou lancer un appel).
import { tool, str, num, type PhoneAction } from "./types.ts";

const queue = (a: PhoneAction, note: string) => async (ctx: any) => { ctx.phone.push(a); return { ouvert_sur_le_telephone: note }; };

export const phoneTools = [
  tool("telephone_sms", "Ouvre un SMS pré-rempli sur le téléphone ; l'utilisateur appuie sur Envoyer.",
    { numero: str("Numéro de téléphone"), texte: str("Message") }, ["numero", "texte"],
    (ctx, i) => queue({ type: "sms", to: i.numero, body: i.texte }, "SMS prêt, il reste à appuyer sur Envoyer")(ctx)),
  tool("telephone_appeler", "Lance un appel téléphonique (iOS demande une confirmation à l'écran).",
    { numero: str("Numéro de téléphone") }, ["numero"],
    (ctx, i) => queue({ type: "call", to: i.numero }, "Appel proposé à l'écran")(ctx)),
  tool("whatsapp_message", "Ouvre une conversation WhatsApp avec le message pré-rempli ; l'utilisateur appuie sur Envoyer.",
    { numero: str("Numéro au format international, ex. +33612345678"), texte: str("Message") }, ["numero", "texte"],
    (ctx, i) => queue({ type: "whatsapp", to: i.numero, text: i.texte }, "WhatsApp ouvert, il reste à appuyer sur Envoyer")(ctx)),
  tool("spotify_lancer", "Ouvre Spotify sur une playlist, un artiste ou un titre.",
    { recherche: str("Playlist, artiste ou titre") }, ["recherche"],
    (ctx, i) => queue({ type: "spotify", query: i.recherche }, "Spotify ouvert")(ctx)),
  tool("telephone_alarme", "Règle une vraie alarme (à une heure) ou un minuteur (une durée) sur l'iPhone. Le compte à rebours s'affiche dans la Dynamic Island.",
    { heure: str("Heure locale de l'alarme, format AAAA-MM-JJTHH:MM (alarme)"), minutes: num("Durée du minuteur en minutes (minuteur)"), libelle: str("Libellé, ex. « Pâtes » ou « Réveil »") },
    [],
    (ctx, i) => queue({ type: "alarm", at: i.heure, minutes: i.minutes, label: i.libelle }, i.minutes ? `Minuteur de ${i.minutes} min lancé` : "Alarme réglée")(ctx)),
  tool("camera_regarder", "Ouvre l'appareil photo (ou la photothèque) pour que NOÉMIA regarde quelque chose : « qu'est-ce que c'est ? », un devis, un chantier, un document. Tu recevras ensuite la photo avec la question.",
    { question: str("Ce que l'utilisateur veut savoir sur la photo"), source: { type: "string", enum: ["camera", "photos"], description: "camera (par défaut) ou photos" } },
    ["question"],
    (ctx, i) => queue({ type: "camera", question: i.question, source: i.source ?? "camera" }, "Appareil photo ouvert, j'attends la photo")(ctx)),
  tool("telephone_concentration", "Active ou coupe le mode silencieux / Concentration (via les Raccourcis NOÉMIA).",
    { etat: { type: "string", enum: ["activer", "desactiver"] } }, ["etat"],
    (ctx, i) => queue({ type: "shortcut", name: "NOEMIA Concentration", input: i.etat }, "Raccourci lancé")(ctx)),
  tool("itineraire", "Ouvre l'itinéraire vers une adresse dans Plans.",
    { destination: str("Adresse ou lieu") }, ["destination"],
    (ctx, i) => queue({ type: "maps", destination: i.destination }, "Itinéraire ouvert")(ctx)),
];
