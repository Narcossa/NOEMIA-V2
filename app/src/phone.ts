// Actions sur le téléphone demandées par NOÉMIA. iOS impose l'appui final de l'utilisateur
// (Envoyer, Appeler) : l'appli ouvre seulement le bon écran, pré-rempli.
import { Linking } from "react-native";
import * as SMS from "expo-sms";
import type { PhoneAction } from "./api";
import { addIcloudEvent, addReminder } from "./device";
import { Native } from "../modules/noemia-native/src";

// Trajet : estimation d'arrivée par Plans, affichée en Live Activity / Dynamic Island
export async function startTrip(destination: string) {
  const eta = await Native.tripEstimate(destination);
  if (!eta) return null;
  const arrivee = new Date(eta.arrivee);
  const h = arrivee.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  await Native.startActivity("trajet", `Vers ${eta.nom}`, `Arrivée prévue à ${h} · ${eta.minutes} min`, arrivee);
  return { ...eta, heure: h };
}

const digits = (n: string) => n.replace(/[^\d+]/g, "");

export async function perform(a: PhoneAction): Promise<string | null> {
  try {
    switch (a.type) {
      case "sms":
        if (!(await SMS.isAvailableAsync())) return "Les SMS ne sont pas disponibles sur cet appareil.";
        await SMS.sendSMSAsync([digits(a.to)], a.body);
        return null;
      case "call":
        await Linking.openURL(`tel:${digits(a.to)}`);
        return null;
      case "whatsapp":
        await Linking.openURL(`whatsapp://send?phone=${digits(a.to).replace("+", "")}&text=${encodeURIComponent(a.text)}`);
        return null;
      case "spotify":
        await Linking.openURL(`spotify:search:${encodeURIComponent(a.query)}`);
        return null;
      case "shortcut": {
        const input = a.input ? `&input=text&text=${encodeURIComponent(a.input)}` : "";
        await Linking.openURL(`shortcuts://run-shortcut?name=${encodeURIComponent(a.name)}${input}`);
        return null;
      }
      case "maps":
        await Linking.openURL(`maps://?daddr=${encodeURIComponent(a.destination)}`);
        return null;
      case "alarm": {
        // Vraies alarmes iOS 26 (compte à rebours dans la Dynamic Island), sinon Raccourcis
        const at = a.at ? new Date(a.at.length === 16 ? a.at + ":00" : a.at) : null;
        const seconds = a.minutes ? a.minutes * 60 : null;
        if (Native.alarmKitAvailable() && await Native.scheduleAlarm(at, seconds, a.label ?? (seconds ? "Minuteur" : "Alarme"))) return null;
        const name = seconds ? "NOEMIA Minuteur" : "NOEMIA Alarme";
        const input = seconds ? String(a.minutes) : [at?.toTimeString().slice(0, 5), a.label].filter(Boolean).join("|");
        await Linking.openURL(`shortcuts://run-shortcut?name=${encodeURIComponent(name)}&input=text&text=${encodeURIComponent(input)}`);
        return null;
      }
      case "camera":
        return null; // géré par l'écran principal (photo puis nouvelle question)
      case "reminder":
        return await addReminder(a.title, a.due, a.list);
      case "icloud_event":
        return await addIcloudEvent(a.title, a.start, a.end, a.location);
    }
  } catch {
    const app = { whatsapp: "WhatsApp", spotify: "Spotify", shortcut: "Raccourcis", maps: "Plans", sms: "Messages", call: "Téléphone", reminder: "Rappels", icloud_event: "Calendrier", alarm: "Horloge", camera: "Appareil photo" }[a.type];
    return `Je n'ai pas pu ouvrir ${app}. Est-ce que l'application est installée ?`;
  }
  return null;
}
