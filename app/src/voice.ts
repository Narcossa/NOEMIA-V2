// Voix et oreilles de NOÉMIA : synthèse vocale d'iOS (voix Premium/Améliorée) et reconnaissance vocale.
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Platform } from "react-native";

export type VoiceInfo = { identifier: string; name: string; quality: string; language: string };

const PREFERRED = /aur[ée]lie|marie|audrey|am[ée]lie/i;

export async function frenchVoices(): Promise<VoiceInfo[]> {
  const voices = (await Speech.getAvailableVoicesAsync()).filter(v => v.language?.toLowerCase().startsWith("fr"));
  const score = (v: VoiceInfo) =>
    (v.quality === "Enhanced" ? 10 : 0) + (/premium/i.test(v.identifier) ? 5 : 0) +
    (PREFERRED.test(v.name) ? 3 : 0) + (v.language === "fr-FR" ? 2 : 0);
  return voices.sort((a, b) => score(b) - score(a));
}

type SayOptions = {
  voice?: string;
  rate?: number;
  onWord?: (word: string) => void;
  onStart?: () => void;
};

// Prononce un texte ; résout quand c'est fini (ou interrompu)
export function say(text: string, o: SayOptions = {}): Promise<void> {
  if (Platform.OS === "ios") {
    // Après l'écoute, iOS reste en mode « mesure » : on repasse en lecture normale sur le haut-parleur
    try {
      ExpoSpeechRecognitionModule.setCategoryIOS({ category: "playAndRecord", categoryOptions: ["defaultToSpeaker", "allowBluetooth"], mode: "spokenAudio" });
    } catch {}
  }
  return new Promise(resolve => {
    Speech.speak(text, {
      language: "fr-FR",
      voice: o.voice,
      rate: o.rate ?? 1,
      pitch: 1.0,
      onStart: o.onStart,
      onBoundary: (ev: any) => {
        const i = typeof ev?.charIndex === "number" ? ev.charIndex : -1;
        if (i < 0) return;
        const word = text.slice(i).match(/^[\p{L}'’-]+/u)?.[0];
        if (word) o.onWord?.(word);
      },
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export const stopSpeaking = () => Speech.stop();

export async function ensureListenPermission(): Promise<boolean> {
  const r = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  return r.granted;
}

export function startListening() {
  ExpoSpeechRecognitionModule.start({
    lang: "fr-FR",
    interimResults: true,
    continuous: false,
    iosTaskHint: "dictation",
    addsPunctuation: true,
  });
}

export const stopListening = () => ExpoSpeechRecognitionModule.stop();
export const abortListening = () => ExpoSpeechRecognitionModule.abort();
