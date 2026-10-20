// Actions que seul le téléphone peut faire. Le serveur ne les exécute pas : il les renvoie à l'appli,
// qui ouvre le bon écran (iOS impose un appui de l'utilisateur pour envoyer un SMS ou lancer un appel).
import { tool, str, type PhoneAction } from "./types.ts";

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
  tool("telephone_reveil", "Règle une alarme ou un minuteur sur l'iPhone (via les Raccourcis NOÉMIA installés).",
    { type: { type: "string", enum: ["alarme", "minuteur"] }, valeur: str("Heure HH:MM pour une alarme, durée en minutes pour un minuteur"), libelle: str("Libellé") },
    ["type", "valeur"],
    (ctx, i) => queue({ type: "shortcut", name: i.type === "alarme" ? "NOEMIA Alarme" : "NOEMIA Minuteur", input: [i.valeur, i.libelle].filter(Boolean).join("|") },
      "Raccourci lancé")(ctx)),
  tool("telephone_concentration", "Active ou coupe le mode silencieux / Concentration (via les Raccourcis NOÉMIA).",
    { etat: { type: "string", enum: ["activer", "desactiver"] } }, ["etat"],
    (ctx, i) => queue({ type: "shortcut", name: "NOEMIA Concentration", input: i.etat }, "Raccourci lancé")(ctx)),
  tool("itineraire", "Ouvre l'itinéraire vers une adresse dans Plans.",
    { destination: str("Adresse ou lieu") }, ["destination"],
    (ctx, i) => queue({ type: "maps", destination: i.destination }, "Itinéraire ouvert")(ctx)),
];
