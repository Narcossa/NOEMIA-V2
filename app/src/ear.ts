// Oreille de NOÉMIA : écoute continue avec détection de fin de phrase.
// iOS coupait l'écoute dès la moindre pause ; ici on attend un vrai silence,
// plus long si la phrase semble inachevée (« … et », « … de »).
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";

const UNFINISHED = /\b(et|ou|de|du|des|le|la|les|un|une|à|au|aux|pour|avec|que|qui|mais|donc|alors|puis|dans|sur|en|euh|hum|parce|si|est-ce)\s*$/i;

export class Ear {
  private text = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  active = false;

  constructor(private onFinal: (text: string) => void, private onPartial: (text: string) => void) {}

  start(patienceMs = 7000) {
    this.text = ""; this.active = true;
    ExpoSpeechRecognitionModule.start({
      lang: "fr-FR", interimResults: true, continuous: true, iosTaskHint: "dictation", addsPunctuation: true,
    });
    // Personne ne parle : on referme sans rien envoyer
    this.startTimer = setTimeout(() => { if (!this.text) this.finish(); }, patienceMs);
  }

  // Appelé par l'événement « result » de la reconnaissance
  result(transcript: string) {
    if (!this.active) return;
    this.text = transcript;
    this.onPartial(transcript);
    clearTimeout(this.startTimer);
    clearTimeout(this.timer);
    const wait = UNFINISHED.test(transcript.trim()) ? 2200 : 1250;
    this.timer = setTimeout(() => this.finish(), wait);
  }

  // Fin demandée (silence, bouton, ou fin d'écoute côté iOS)
  finish() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer); clearTimeout(this.startTimer);
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    const t = this.text.trim();
    this.text = "";
    this.onFinal(t);
  }

  abort() {
    this.active = false;
    clearTimeout(this.timer); clearTimeout(this.startTimer);
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
  }
}
