// Oreille de NOÉMIA : écoute continue avec détection de fin de phrase.
// Sur iOS 26, elle utilise la nouvelle reconnaissance d'Apple, entièrement sur l'iPhone
// (plus rapide, sans connexion) ; sinon la reconnaissance vocale classique d'iOS.
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import type { EventSubscription } from "expo-modules-core";
import { Native } from "../modules/noemia-native/src";

const UNFINISHED = /\b(et|ou|de|du|des|le|la|les|un|une|à|au|aux|pour|avec|que|qui|mais|donc|alors|puis|dans|sur|en|euh|hum|parce|si|est-ce)\s*$/i;

export class Ear {
  private text = "";
  private timer: ReturnType<typeof setTimeout> | undefined;
  private startTimer: ReturnType<typeof setTimeout> | undefined;
  private subs: (EventSubscription | undefined)[] = [];
  private engine: "apple" | "classique" = "classique";
  active = false;
  preferApple = true;

  constructor(private onFinal: (text: string) => void, private onPartial: (text: string) => void, private onFail: (message: string) => void = () => {}) {}

  get usesApple() { return this.preferApple && Native.analyzerAvailable(); }

  start(patienceMs = 7000) {
    this.text = ""; this.active = true;
    this.engine = this.usesApple ? "apple" : "classique";
    if (this.engine === "apple") {
      this.subs = [
        Native.onTranscript(e => this.result(e.text)),
        Native.onTranscriptError(e => { if (this.active) { this.engine = "classique"; this.startClassic(); this.onFail(e.message); } }),
      ];
      Native.startAnalyzer("fr-FR").catch(() => {
        // Modèle indisponible (pas encore téléchargé…) : on repasse sur la reconnaissance classique
        if (this.active) { this.engine = "classique"; this.startClassic(); }
      });
    } else this.startClassic();
    // Personne ne parle : on referme sans rien envoyer
    this.startTimer = setTimeout(() => { if (!this.text) this.finish(); }, patienceMs);
  }

  private startClassic() {
    ExpoSpeechRecognitionModule.start({ lang: "fr-FR", interimResults: true, continuous: true, iosTaskHint: "dictation", addsPunctuation: true });
  }

  // Texte reconnu (partiel) : on attend un vrai silence avant de considérer la phrase finie
  result(transcript: string) {
    if (!this.active || !transcript) return;
    this.text = transcript;
    this.onPartial(transcript);
    clearTimeout(this.startTimer);
    clearTimeout(this.timer);
    const wait = UNFINISHED.test(transcript.trim()) ? 2200 : 1250;
    this.timer = setTimeout(() => this.finish(), wait);
  }

  // Événement « fin » de la reconnaissance classique
  classicEnded() { if (this.engine === "classique") this.finish(); }

  finish() {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer); clearTimeout(this.startTimer);
    this.stopEngine();
    const t = this.text.trim();
    this.text = "";
    this.onFinal(t);
  }

  abort() {
    this.active = false;
    clearTimeout(this.timer); clearTimeout(this.startTimer);
    this.stopEngine(true);
  }

  private stopEngine(abort = false) {
    this.subs.forEach(s => s?.remove()); this.subs = [];
    if (this.engine === "apple") Native.stopAnalyzer();
    else try { abort ? ExpoSpeechRecognitionModule.abort() : ExpoSpeechRecognitionModule.stop(); } catch {}
  }
}
