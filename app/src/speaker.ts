// Parole fluide : le texte arrive du serveur par morceaux ; dès qu'une phrase est complète,
// elle part dans la file de la synthèse vocale d'iOS. NOÉMIA commence donc à parler pendant
// qu'elle rédige la suite, sans blanc entre les phrases.
import * as Speech from "expo-speech";
import { ExpoSpeechRecognitionModule } from "expo-speech-recognition";
import { Platform } from "react-native";

type Hooks = {
  onStart?: () => void;                 // première phrase lancée
  onSentence?: (s: string) => void;     // phrase en cours (sous-titres)
  onWord?: (w: string) => void;         // mot prononcé (lèvres)
  onEstimate?: (s: string) => void;     // pas de mots signalés : animation estimée
  onIdle?: () => void;                  // plus rien à dire
};

const END = /([.!?…:;])(\s+|$)/;

export class Speaker {
  private buf = "";
  private pending = 0;
  private started = false;
  private closed = false;
  private gen = 0;
  private waiters: (() => void)[] = [];
  voice?: string;
  rate = 1;
  muted = false;   // mode silencieux (question tapée au clavier) : texte seulement

  constructor(private hooks: Hooks) {}

  get speaking() { return this.pending > 0; }

  // Nouveau tour de parole
  begin() {
    this.gen++;
    this.buf = ""; this.pending = 0; this.started = false; this.closed = false;
    if (Platform.OS === "ios") {
      try { ExpoSpeechRecognitionModule.setCategoryIOS({ category: "playAndRecord", categoryOptions: ["defaultToSpeaker", "allowBluetooth"], mode: "spokenAudio" }); } catch {}
    }
  }

  push(delta: string) {
    this.buf += delta;
    for (;;) {
      const m = this.buf.match(END);
      // première phrase : on part aussi sur une virgule si elle est déjà longue
      const comma = !this.started && this.buf.length > 70 ? this.buf.indexOf(", ", 40) : -1;
      if (m && m.index !== undefined) { this.say(this.buf.slice(0, m.index + 1)); this.buf = this.buf.slice(m.index + m[0].length); continue; }
      if (comma > 0) { this.say(this.buf.slice(0, comma + 1)); this.buf = this.buf.slice(comma + 2); continue; }
      if (this.buf.length > 220) { const sp = this.buf.lastIndexOf(" ", 200); this.say(this.buf.slice(0, sp)); this.buf = this.buf.slice(sp + 1); continue; }
      break;
    }
  }

  // Le serveur a fini : on dit le reste
  end() {
    if (this.buf.trim()) this.say(this.buf);
    this.buf = "";
    this.closed = true;
    if (this.pending === 0) this.idle();
  }

  // Résout quand tout ce qui est en file a été dit
  whenIdle() { return this.pending === 0 && this.closed ? Promise.resolve() : new Promise<void>(r => this.waiters.push(r)); }

  private idle() {
    this.hooks.onIdle?.();
    const w = this.waiters; this.waiters = []; w.forEach(f => f());
  }

  // Phrase isolée (erreur, accueil…)
  sayNow(text: string) {
    this.begin(); this.push(text); this.end();
    return this.whenIdle();
  }

  async stop() {
    this.gen++;
    this.buf = ""; this.pending = 0; this.closed = true;
    await Speech.stop();
    const w = this.waiters; this.waiters = []; w.forEach(f => f());
  }

  private say(raw: string) {
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text || !/[\p{L}\p{N}]/u.test(text)) return;
    const gen = this.gen;
    if (this.muted) {
      if (!this.started) { this.started = true; this.hooks.onStart?.(); }
      this.hooks.onSentence?.(text);
      return;
    }
    this.pending++;
    let gotWord = false, timer: ReturnType<typeof setTimeout> | undefined;
    Speech.speak(text, {
      language: "fr-FR", voice: this.voice, rate: this.rate, pitch: 1.0,
      onStart: () => {
        if (gen !== this.gen) return;
        if (!this.started) { this.started = true; this.hooks.onStart?.(); }
        this.hooks.onSentence?.(text);
        timer = setTimeout(() => { if (!gotWord && gen === this.gen) this.hooks.onEstimate?.(text); }, 300);
      },
      onBoundary: (ev: any) => {
        if (gen !== this.gen || typeof ev?.charIndex !== "number") return;
        const w = text.slice(ev.charIndex).match(/^[\p{L}'’-]+/u)?.[0];
        if (w) { gotWord = true; this.hooks.onWord?.(w); }
      },
      onDone: () => this.finished(gen, timer),
      onStopped: () => this.finished(gen, timer),
      onError: () => this.finished(gen, timer),
    });
  }

  private finished(gen: number, timer?: ReturnType<typeof setTimeout>) {
    clearTimeout(timer);
    if (gen !== this.gen) return;
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0 && this.closed) this.idle();
  }
}
