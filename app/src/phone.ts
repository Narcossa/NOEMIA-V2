// Actions sur le téléphone demandées par NOÉMIA. iOS impose l'appui final de l'utilisateur
// (Envoyer, Appeler) : l'appli ouvre seulement le bon écran, pré-rempli.
import { Linking } from "react-native";
import * as SMS from "expo-sms";
import type { PhoneAction } from "./api";
import { addIcloudEvent, addReminder } from "./device";

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
      case "reminder":
        return await addReminder(a.title, a.due, a.list);
      case "icloud_event":
        return await addIcloudEvent(a.title, a.start, a.end, a.location);
    }
  } catch {
    const app = { whatsapp: "WhatsApp", spotify: "Spotify", shortcut: "Raccourcis", maps: "Plans", sms: "Messages", call: "Téléphone", reminder: "Rappels", icloud_event: "Calendrier" }[a.type];
    return `Je n'ai pas pu ouvrir ${app}. Est-ce que l'application est installée ?`;
  }
  return null;
}
