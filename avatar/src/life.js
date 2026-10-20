// Moteur de vie de NOÉMIA : tout ce qui bouge sans qu'on le demande
// (respiration, clignements, regard, micro-mouvements), plus les émotions, le halo et la bouche.
// Il ne dessine rien : il produit à chaque image un état que le renderer applique.

const EMOTIONS = {
  neutre:        { smile: 0,    browUp: 0,    browIn: 0,   squint: 0 },
  sourire:       { smile: 0.55, browUp: 0.1,  browIn: 0,   squint: 0.12 },
  joie:          { smile: 1,    browUp: 0.35, browIn: 0,   squint: 0.22 },
  amusee:        { smile: 0.7,  browUp: 0.5,  browIn: 0,   squint: 0.15 },
  concentration: { smile: 0,    browUp: 0,    browIn: 0.7, squint: 0.18 },
  inquietude:    { smile: 0,    browUp: 0.7,  browIn: 0.7, squint: 0 },
  surprise:      { smile: 0.1,  browUp: 1,    browIn: 0,   squint: -0.1 },
};

const BLUE = [0.33, 0.6, 1.0];
const AMBER = [1.0, 0.62, 0.2];

export const HALO_STATES = ["repos", "ecoute", "reflexion", "parole", "action", "probleme"];
export const EMOTION_NAMES = Object.keys(EMOTIONS);

const approach = (x, target, k, dt) => x + (target - x) * (1 - Math.exp(-k * dt));
const rand = (a, b) => a + Math.random() * (b - a);

export class Life {
  constructor() {
    this.t = 0;
    this.emotion = "neutre";
    this.halo = "repos";
    this.mouthKeys = [];      // [{t, jaw, w}] en secondes de this.t
    this.speaking = false;
    this.phase = Array.from({ length: 8 }, () => rand(0, Math.PI * 2));
    this.nextBlink = rand(1.5, 4);
    this.blinkStart = -1;
    this.doubleBlink = false;
    this.nextSaccade = 0;
    this.gazeTarget = [0, 0];
    this.s = {
      breath: 0, yaw: 0, pitch: 0, roll: 0, blinkL: 0, blinkR: 0, gazeX: 0, gazeY: 0,
      jaw: 0, mouthW: 0, smile: 0, browUp: 0, browIn: 0,
      haloColor: [...BLUE], haloInt: 0.4, lightInt: 1,
    };
    this.squint = 0;
  }

  setEmotion(name) { if (EMOTIONS[name]) this.emotion = name; }
  setHalo(state) { if (HALO_STATES.includes(state)) this.halo = state; }

  // Formes de bouche à venir ; remplace tout ce qui était prévu après la première clé
  queueMouth(keys) {
    if (!keys.length) return;
    this.mouthKeys = this.mouthKeys.filter(k => k.t < keys[0].t).concat(keys);
  }
  closeMouth(at = this.t) { this.queueMouth([{ t: at, jaw: 0, w: 0 }]); }

  #mouthTarget() {
    const keys = this.mouthKeys;
    while (keys.length > 1 && keys[1].t <= this.t) keys.shift();
    if (!keys.length || keys[0].t > this.t) return { jaw: 0, w: 0 };
    const a = keys[0], b = keys[1];
    // une forme tient ~70 % de son créneau puis glisse vers la suivante
    if (!b) return this.t - a.t < 0.12 ? a : { jaw: 0, w: 0 };
    const f = Math.min(1, Math.max(0, ((this.t - a.t) / (b.t - a.t) - 0.55) / 0.45));
    return { jaw: a.jaw + (b.jaw - a.jaw) * f, w: a.w + (b.w - a.w) * f };
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const t = this.t, s = this.s, ph = this.phase, e = EMOTIONS[this.emotion];
    const listening = this.halo === "ecoute", talking = this.halo === "parole";

    // Respiration : ~15 cycles par minute, un peu plus ample quand elle parle
    const br = Math.sin(t * 1.55 + ph[0]);
    s.breath = br * (talking ? 0.7 : 1);

    // Bouche
    const m = this.#mouthTarget();
    const jitter = talking && m.jaw > 0.05 ? 0.06 * Math.sin(t * 23 + ph[1]) : 0;
    s.jaw = approach(s.jaw, Math.max(0, m.jaw + jitter + (this.emotion === "surprise" ? 0.18 : 0)), 28, dt);
    s.mouthW = approach(s.mouthW, m.w + e.smile * 0.35, 22, dt);

    // Expression
    s.smile = approach(s.smile, e.smile, 4, dt);
    s.browUp = approach(s.browUp, e.browUp + (talking ? 0.25 * Math.max(0, Math.sin(t * 1.9 + ph[2])) ** 6 : 0), 6, dt);
    s.browIn = approach(s.browIn, e.browIn, 5, dt);
    this.squint = approach(this.squint, e.squint, 5, dt);

    // Tête : dérive lente + hochements quand elle parle, inclinaison quand elle écoute
    const towardUser = listening || talking ? 1 : 0;
    const yawT = 2.6 * Math.sin(t * 0.29 + ph[3]) + 1.2 * Math.sin(t * 0.71 + ph[4]) - 5 * towardUser;
    const pitchT = 1.4 * Math.sin(t * 0.37 + ph[5]) + 1.2 * br + (talking ? 2.2 * s.jaw : 0) + (listening ? 2 : 0);
    const rollT = 0.01 * Math.sin(t * 0.23 + ph[6]) + (listening ? 0.025 : 0);
    s.yaw = approach(s.yaw, yawT, 2.5, dt);
    s.pitch = approach(s.pitch, pitchT, 4, dt);
    s.roll = approach(s.roll, rollT, 2, dt);

    // Regard : petites saccades, vers l'utilisateur quand elle écoute ou parle
    if (t >= this.nextSaccade) {
      this.gazeTarget = [rand(-2.5, 2.5) - 3 * towardUser, rand(-1.2, 1.2)];
      this.nextSaccade = t + (towardUser ? rand(1.2, 3.5) : rand(0.6, 2.8));
    }
    s.gazeX = approach(s.gazeX, this.gazeTarget[0], 30, dt);
    s.gazeY = approach(s.gazeY, this.gazeTarget[1], 30, dt);

    // Clignements : fermeture 70 ms, pause 30 ms, ouverture 130 ms
    if (this.blinkStart < 0 && t >= this.nextBlink) {
      this.blinkStart = t;
      this.doubleBlink = Math.random() < 0.15;
    }
    let lid = 0;
    if (this.blinkStart >= 0) {
      const b = t - this.blinkStart;
      if (b < 0.07) lid = b / 0.07;
      else if (b < 0.1) lid = 1;
      else if (b < 0.23) lid = 1 - (b - 0.1) / 0.13;
      else if (this.doubleBlink) { this.doubleBlink = false; this.blinkStart = t; }
      else { this.blinkStart = -1; this.nextBlink = t + (talking ? rand(1.8, 4) : rand(2.5, 6)); }
    }
    const closure = Math.min(1, Math.max(lid, this.squint + (listening ? -0.05 : 0)));
    s.blinkL = Math.max(0, closure);
    s.blinkR = Math.max(0, closure);

    // Halo et lumières du corps
    let int, color = BLUE, light = 1;
    switch (this.halo) {
      case "ecoute": int = 0.95 + 0.3 * Math.sin(t * 6); light = 1.35; break;
      case "reflexion": int = 0.55 + 0.35 * Math.abs(Math.sin(t * 4.2)); light = 1.15; break;
      case "parole": int = 0.55 + 0.9 * s.jaw; light = 1.2 + 0.4 * s.jaw; break;
      case "action": int = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.4)); light = 1.25; break;
      case "probleme": int = 0.8 + 0.15 * Math.sin(t * 3); color = AMBER; light = 0.9; break;
      default: int = 0.32 + 0.1 * (br * 0.5 + 0.5);
    }
    s.haloInt = approach(s.haloInt, int, 10, dt);
    s.lightInt = approach(s.lightInt, light, 6, dt);
    s.haloColor = s.haloColor.map((c, i) => approach(c, color[i], 6, dt));
    return s;
  }
}
