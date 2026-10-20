// Arrière-plan vivant de NOÉMIA : un studio sobre qui réagit à son état.
// - une aura derrière la tête, de la couleur et de l'intensité du halo (écoute, parole…)
// - des orbites de lumière très fines, écho de l'anneau de son oreille, qui tournent lentement
// - quelques particules en suspension, floues, qui donnent de la profondeur
// - une lueur au sol sous le buste, un vignettage et un grain léger
// Les couleurs suivent le thème jour / nuit (attribut data-daylight).

const PALETTE = {
  jour: { top: [236, 240, 246], bottom: [206, 213, 224], orbit: 0.16, aura: 0.26, particle: [255, 255, 255], vignette: 0.10, ground: 0.10 },
  nuit: { top: [14, 18, 27], bottom: [4, 6, 10], orbit: 0.16, aura: 0.30, particle: [150, 190, 255], vignette: 0.45, ground: 0.22 },
};

const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export class Backdrop {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.particles = Array.from({ length: 38 }, () => this.#particle(true));
    this.grain = this.#makeGrain();
  }

  #particle(anywhere) {
    return {
      x: Math.random(), y: anywhere ? Math.random() : 1.05,
      z: 0.3 + Math.random() * 0.7,              // profondeur : 1 = proche (plus gros, plus rapide)
      phase: Math.random() * Math.PI * 2,
      speed: 0.004 + Math.random() * 0.01,
    };
  }

  #makeGrain() {
    const g = document.createElement("canvas");
    g.width = g.height = 128;
    const x = g.getContext("2d"), img = x.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 10;
    }
    x.putImageData(img, 0, 0);
    return g;
  }

  // state : état du moteur de vie (haloColor, haloInt, breath) ; head : centre et taille de la tête à l'écran (px CSS)
  draw(state, t, dt, head) {
    const cv = this.canvas, ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const P = PALETTE[document.documentElement.dataset.daylight === "nuit" ? "nuit" : "jour"];
    const halo = state.haloColor.map(v => v * 255);
    const energy = Math.min(1.6, state.haloInt);

    // 1. Fond : dégradé vertical
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, rgb(P.top)); bg.addColorStop(1, rgb(P.bottom));
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);

    // 2. Aura derrière la tête
    const R = head.r * (2.1 + 0.06 * state.breath);
    const aura = ctx.createRadialGradient(head.x, head.y, head.r * 0.2, head.x, head.y, R);
    aura.addColorStop(0, rgb(halo, P.aura * (0.5 + 0.5 * energy)));
    aura.addColorStop(0.55, rgb(halo, P.aura * 0.25 * (0.5 + 0.5 * energy)));
    aura.addColorStop(1, rgb(halo, 0));
    ctx.fillStyle = aura; ctx.fillRect(0, 0, w, h);

    // 3. Orbites : arcs fins qui tournent lentement autour de la tête
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.lineCap = "round";
    [1.25, 1.75, 2.35].forEach((k, i) => {
      const rr = head.r * k;
      const rot = t * (0.05 + i * 0.02) * (i % 2 ? -1 : 1) + i;
      ctx.lineWidth = i === 0 ? 1.2 : 0.8;
      ctx.strokeStyle = rgb(halo, P.orbit * (1 - i * 0.25) * (0.6 + 0.4 * energy));
      for (let s = 0; s < 3; s++) {
        const a0 = rot + s * (Math.PI * 2 / 3);
        ctx.beginPath();
        ctx.ellipse(0, 0, rr, rr * 0.92, 0, a0, a0 + 0.9 + 0.3 * Math.sin(t * 0.3 + s));
        ctx.stroke();
      }
    });
    ctx.restore();

    // 4. Particules en suspension
    for (const p of this.particles) {
      p.y -= p.speed * p.z * dt * (1 + 0.6 * energy);
      if (p.y < -0.05) Object.assign(p, this.#particle(false));
      const x = (p.x + 0.015 * Math.sin(t * 0.4 + p.phase)) * w;
      const y = p.y * h;
      const r = (1 + 2.4 * p.z) * (P === PALETTE.nuit ? 1 : 1.3);
      const a = (0.10 + 0.25 * p.z) * (0.6 + 0.4 * Math.sin(t * 0.8 + p.phase));
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, rgb(P.particle, a)); g.addColorStop(1, rgb(P.particle, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
    }

    // 5. Lueur au sol sous le buste
    const gy = h * 0.985;
    ctx.save();
    ctx.translate(head.groundX, gy); ctx.scale(1, 0.18);
    const ground = ctx.createRadialGradient(0, 0, 0, 0, 0, head.r * 3.2);
    ground.addColorStop(0, rgb(halo, P.ground * (0.7 + 0.3 * energy)));
    ground.addColorStop(1, rgb(halo, 0));
    ctx.fillStyle = ground; ctx.beginPath(); ctx.arc(0, 0, head.r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 6. Vignettage
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.35, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
    vig.addColorStop(0, "rgba(0,0,0,0)"); vig.addColorStop(1, `rgba(0,0,0,${P.vignette})`);
    ctx.fillStyle = vig; ctx.fillRect(0, 0, w, h);

    // 7. Grain très léger (évite l'effet « dégradé numérique » plat)
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.fillStyle = ctx.createPattern(this.grain, "repeat");
    ctx.translate((t * 37) % 128, (t * 53) % 128);
    ctx.fillRect(-128, -128, w + 256, h + 256);
    ctx.restore();
  }
}

// Position de la tête à l'écran, d'après la place réelle du canvas de NOÉMIA
export function headOnScreen(avatarCanvas, rig, image) {
  const r = avatarCanvas.getBoundingClientRect();
  const sx = r.width / image.width, sy = r.height / image.height;
  return {
    x: r.left + rig.head.center[0] * sx,
    y: r.top + rig.head.center[1] * sy,
    r: rig.head.radius[0] * sx,
    groundX: r.left + r.width * 0.5,
  };
}
