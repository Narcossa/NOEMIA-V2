// Voix de NOÉMIA : synthèse vocale du système (gratuite, sur l'appareil) + pilotage des lèvres.
// Sur iPhone, ce sont les voix d'iOS ; les voix « Premium » / « Améliorée » s'installent dans
// Réglages › Accessibilité › Contenu énoncé › Voix › Français.

import { scheduleWord, estimateDuration } from "./lipsync-fr.js";

const QUALITY = /premium|enhanced|améliorée|amelioree|natural|neural|siri/i;

export function frenchVoices() {
  const all = speechSynthesis.getVoices().filter(v => /^fr/i.test(v.lang));
  const score = v => (QUALITY.test(v.name) ? 4 : 0) + (/fr[-_]FR/i.test(v.lang) ? 2 : 0) + (v.localService ? 1 : 0);
  return all.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

export function onVoicesReady(cb) {
  if (!("speechSynthesis" in window)) return cb([]);
  const list = frenchVoices();
  if (list.length) cb(list);
  speechSynthesis.addEventListener?.("voiceschanged", () => cb(frenchVoices()));
}

export class Voice {
  constructor(life) {
    this.life = life;
    this.voice = null;
    this.rate = 1;
    this.pitch = 1.05;
  }

  get available() { return "speechSynthesis" in window; }

  stop() {
    if (this.available) speechSynthesis.cancel();
    this.life.closeMouth();
  }

  // Résout quand la phrase est terminée
  say(text) {
    const life = this.life;
    if (!this.available) return this.#mime(text);
    speechSynthesis.cancel();
    return new Promise(resolve => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = this.voice?.lang || "fr-FR";
      if (this.voice) u.voice = this.voice;
      u.rate = this.rate; u.pitch = this.pitch;

      let gotBoundary = false, fallbackTimer = null, done = false;
      const finish = () => {
        if (done) return; done = true;
        clearTimeout(fallbackTimer); clearTimeout(safety);
        life.closeMouth(); resolve();
      };

      // Certaines voix ne signalent pas les mots (ou démarrent sans « onstart ») :
      // on anime alors toute la phrase par estimation
      const armFallback = delay => {
        clearTimeout(fallbackTimer);
        fallbackTimer = setTimeout(() => { if (!gotBoundary) this.#scheduleAll(text, life.t); }, delay);
      };
      armFallback(700);
      u.onstart = () => armFallback(300);
      u.onboundary = ev => {
        if (ev.name && ev.name !== "word") return;
        gotBoundary = true;
        const rest = text.slice(ev.charIndex);
        const word = (rest.match(/^[\p{L}'’-]+/u) || [""])[0];
        if (!word) return;
        const dur = estimateDuration(word, this.rate);
        life.queueMouth([...scheduleWord(word, life.t, dur), { t: life.t + dur, jaw: 0.05, w: 0 }]);
      };
      u.onend = finish;
      u.onerror = finish;
      // Filet de sécurité si le navigateur ne déclenche jamais « onend »
      const safety = setTimeout(finish, 2000 + text.length * 120 / this.rate);
      speechSynthesis.speak(u);
    });
  }

  #scheduleAll(text, t0) {
    let t = t0;
    const keys = [];
    for (const m of text.matchAll(/[\p{L}'’-]+|[.,;:!?…]/gu)) {
      const tok = m[0];
      if (/^[.,;:!?…]$/.test(tok)) { keys.push({ t, jaw: 0, w: 0 }); t += /[,;:]/.test(tok) ? 0.18 : 0.35; continue; }
      const dur = estimateDuration(tok, this.rate);
      keys.push(...scheduleWord(tok, t, dur));
      t += dur + 0.04;
    }
    keys.push({ t, jaw: 0, w: 0 });
    this.life.queueMouth(keys);
  }

  // Sans synthèse vocale : la bouche bouge quand même, en silence
  #mime(text) {
    this.#scheduleAll(text, this.life.t);
    return new Promise(r => setTimeout(r, text.length * 75));
  }
}
