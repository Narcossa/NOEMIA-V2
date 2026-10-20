// Rendu WebGL de NOÉMIA : la photo est déformée en temps réel, pixel par pixel.
// Chaque fragment calcule où lire dans l'image d'origine (déformation inverse) :
// respiration → tête → bouche → sourire → sourcils → paupières → regard, puis ajoute les lumières.

import { IMAGE, RIG, lipCurve } from "./rig.js";

const VERT = `
attribute vec2 aPos;
varying vec2 vPx;
uniform vec2 uSize;
void main() {
  vPx = vec2((aPos.x * 0.5 + 0.5) * uSize.x, (0.5 - aPos.y * 0.5) * uSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vPx;
uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uTime;

// état d'animation
uniform float uBreath;      // -1..1
uniform vec3  uHead;        // lacet (px), tangage (px), roulis (rad)
uniform vec2  uBlink;       // fermeture œil gauche, droit (0..1)
uniform vec2  uGaze;        // décalage du regard (px)
uniform float uJaw;         // ouverture de la bouche (0..1)
uniform float uMouthW;      // -1 lèvres arrondies … +1 lèvres étirées
uniform float uSmile;       // 0..1
uniform vec2  uBrow;        // haussement, froncement (0..1)
uniform vec3  uHaloColor;
uniform float uHaloInt;     // intensité de l'anneau
uniform float uLightInt;    // intensité des lumières bleues du corps

// repères
uniform vec2 uHeadC; uniform vec2 uHeadR; uniform vec2 uPivot; uniform vec2 uFront;
uniform vec2 uEyeLC; uniform vec2 uEyeLR; uniform vec2 uEyeRC; uniform vec2 uEyeRR;
uniform vec2 uBrowLC; uniform vec2 uBrowLR; uniform vec2 uBrowRC; uniform vec2 uBrowRR;
uniform vec2 uBrowLI; uniform vec2 uBrowRI;
uniform vec3 uLip; uniform vec2 uMouthL; uniform vec2 uMouthR;
uniform vec2 uCheekL; uniform vec2 uCheekR; uniform vec2 uChin;
uniform vec2 uEarC; uniform vec2 uEarR; uniform vec2 uChest;

float gauss2(vec2 p, vec2 c, vec2 s) { vec2 d = (p - c) / s; return exp(-dot(d, d)); }
float ell(vec2 p, vec2 c, vec2 r) { return length((p - c) / r); }

// Paupière qui descend : la peau au-dessus de l'œil glisse vers le bas
vec2 eyelid(vec2 p, vec2 c, vec2 r, float k) {
  float dx = (p.x - c.x) / r.x;
  float prof = sqrt(max(0.0, 1.0 - dx * dx));
  float edge = 1.0 - smoothstep(0.95, 1.2, abs(dx));
  float top = c.y - r.y * prof;
  float drop = k * 2.0 * r.y * prof * edge;
  float lidY = top + drop;
  if (p.y < lidY) {
    float w = smoothstep(top - 26.0, top, p.y);
    p.y -= drop * w;
  }
  return p;
}

vec2 gaze(vec2 p, vec2 c, vec2 r, vec2 g) {
  float d = ell(p, c, r);
  return p - g * (1.0 - smoothstep(0.55, 1.0, d));
}

void main() {
  vec2 p = vPx;

  // 1. Respiration : léger étirement du buste depuis le bas
  float s = 1.0 + 0.007 * uBreath;
  p = uChest + (p - uChest) / s;

  // 2. Tête : rotation autour du cou + translation, avec parallaxe sur le visage
  float hm = 1.0 - smoothstep(0.82, 1.12, ell(p, uHeadC, uHeadR));
  float ang = -uHead.z * hm;
  vec2 rp = p - uPivot;
  p = uPivot + vec2(rp.x * cos(ang) - rp.y * sin(ang), rp.x * sin(ang) + rp.y * cos(ang));
  float front = gauss2(p, uFront, vec2(150.0));
  p -= vec2(uHead.x * (0.55 + 0.9 * front), uHead.y) * hm;
  vec2 q = p; // coordonnées « tête », utilisées aussi pour le halo

  // 3. Bouche
  float cx = (uMouthL.x + uMouthR.x) * 0.5;
  float hw = (uMouthR.x - uMouthL.x) * 0.5;
  float mouthZone = gauss2(p, vec2(cx, uLip.x * cx * cx + uLip.y * cx + uLip.z), vec2(hw * 1.6, 70.0));
  // largeur : lèvres étirées ou arrondies
  p.x = cx + (p.x - cx) / (1.0 + 0.12 * uMouthW * mouthZone);
  float lipY = uLip.x * p.x * p.x + uLip.y * p.x + uLip.z;
  float t = (p.x - cx) / (hw * (1.0 + 0.08 * uMouthW) + 4.0);
  float shape = pow(max(0.0, 1.0 - t * t), 0.75);
  float gap = uJaw * 21.0 * shape;
  float gapDown = gap * 0.78, gapUp = gap * 0.22;
  bool inside = false;
  float insideT = 0.0;
  if (p.y >= lipY) {
    float fall = 1.0 - 0.45 * smoothstep(lipY, lipY + 120.0, p.y);
    float side = 1.0 - smoothstep(hw * 1.2, hw * 2.4, abs(p.x - cx));
    float dd = gapDown * fall;
    float dJaw = uJaw * 9.0 * side * fall; // la mâchoire descend un peu au-delà des lèvres
    float src = p.y - max(dd, dJaw * (1.0 - shape));
    if (src < lipY && shape > 0.0) { inside = true; insideT = (p.y - lipY) / max(gapDown, 0.001); }
    else p.y = src;
  } else {
    float rise = 1.0 - smoothstep(lipY - 40.0, lipY, p.y);
    float src = p.y + gapUp * (1.0 - rise);
    if (src > lipY && shape > 0.0) { inside = true; insideT = -(lipY - p.y) / max(gapUp, 0.001); }
    else p.y = src;
  }

  // 4. Sourire : commissures et joues remontent
  float cl = gauss2(p, uMouthL, vec2(20.0, 16.0));
  float cr = gauss2(p, uMouthR, vec2(16.0, 16.0));
  p.y += uSmile * (5.0 * (cl + cr) + 3.0 * (gauss2(p, uCheekL, vec2(34.0)) + gauss2(p, uCheekR, vec2(26.0))));
  p.x += uSmile * (2.5 * cl - 1.5 * cr);

  // 5. Sourcils : haussement global, froncement à l'intérieur
  p.y += uBrow.x * 4.0 * (gauss2(p, uBrowLC, uBrowLR) + gauss2(p, uBrowRC, uBrowRR));
  float fl = gauss2(p, uBrowLI, vec2(16.0, 12.0)), fr = gauss2(p, uBrowRI, vec2(12.0, 10.0));
  p.y -= uBrow.y * 3.0 * (fl + fr);
  p.x -= uBrow.y * (2.0 * fl - 2.0 * fr);

  // 6. Paupières puis regard
  p = eyelid(p, uEyeLC, uEyeLR * vec2(1.0, 1.08), uBlink.x);
  p = eyelid(p, uEyeRC, uEyeRR * vec2(1.0, 1.08), uBlink.y);
  if (uBlink.x < 0.5) p = gaze(p, uEyeLC, uEyeLR, uGaze);
  if (uBlink.y < 0.5) p = gaze(p, uEyeRC, uEyeRR, uGaze * 0.8);

  vec4 col = texture2D(uTex, p / uSize);

  // intérieur de la bouche : ombre, avec un soupçon de dents en haut
  if (inside) {
    float teeth = smoothstep(0.05, -0.35, insideT) * smoothstep(5.0, 10.0, gap);
    vec3 dark = vec3(0.13, 0.09, 0.11) * (0.6 + 0.4 * shape);
    col = vec4(mix(dark, vec3(0.80, 0.80, 0.82), teeth * 0.75), 1.0);
  }

  // 7. Lumières bleues du corps (bandes du cou, de la poitrine)
  float blue = smoothstep(0.10, 0.32, col.b - col.r) * smoothstep(0.45, 0.85, col.b);
  float eyeMask = max(1.0 - smoothstep(0.8, 1.6, ell(vPx, uEyeLC, uEyeLR)), 1.0 - smoothstep(0.8, 1.6, ell(vPx, uEyeRC, uEyeRR)));
  blue *= 1.0 - eyeMask;
  col.rgb += uHaloColor * blue * (uLightInt - 0.6) * 0.9;

  // 8. Anneau de l'oreille : il suit la tête
  float e = ell(q, uEarC, uEarR);
  float ring = exp(-pow((e - 0.98) / 0.07, 2.0)) + 0.45 * exp(-pow((e - 1.0) / 0.32, 2.0));
  vec3 glow = uHaloColor * ring * uHaloInt;
  col.rgb += glow * col.a + glow * 0.6 * (1.0 - col.a);
  col.a = max(col.a, clamp(ring * uHaloInt * 0.55, 0.0, 1.0));

  gl_FragColor = vec4(col.rgb * col.a, col.a);
}`;

export class NoemiaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error("WebGL indisponible sur cet appareil");
    this.gl = gl;
    this.prog = this.#program(VERT, FRAG);
    gl.useProgram(this.prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.prog, "aPos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    const n = gl.getProgramParameter(this.prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(this.prog, i).name;
      this.u[name] = gl.getUniformLocation(this.prog, name);
    }
    this.#setRig();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.ready = false;
  }

  async load(src = IMAGE.src) {
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("image introuvable (" + src + ")"));
      im.src = src;
    });
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uTex, 0);
    this.ready = true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr), h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.gl.viewport(0, 0, w, h);
    }
  }

  draw(s, time) {
    if (!this.ready) return;
    const gl = this.gl, u = this.u;
    this.resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.uTime, time);
    gl.uniform1f(u.uBreath, s.breath);
    gl.uniform3f(u.uHead, s.yaw, s.pitch, s.roll);
    gl.uniform2f(u.uBlink, s.blinkL, s.blinkR);
    gl.uniform2f(u.uGaze, s.gazeX, s.gazeY);
    gl.uniform1f(u.uJaw, s.jaw);
    gl.uniform1f(u.uMouthW, s.mouthW);
    gl.uniform1f(u.uSmile, s.smile);
    gl.uniform2f(u.uBrow, s.browUp, s.browIn);
    gl.uniform3f(u.uHaloColor, ...s.haloColor);
    gl.uniform1f(u.uHaloInt, s.haloInt);
    gl.uniform1f(u.uLightInt, s.lightInt);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  #setRig() {
    const gl = this.gl, u = this.u, v2 = (n, a) => gl.uniform2f(u[n], a[0], a[1]);
    v2("uSize", [IMAGE.width, IMAGE.height]);
    v2("uHeadC", RIG.head.center); v2("uHeadR", RIG.head.radius); v2("uPivot", RIG.head.pivot);
    v2("uFront", RIG.faceFront);
    v2("uEyeLC", RIG.eyeL.center); v2("uEyeLR", RIG.eyeL.radius);
    v2("uEyeRC", RIG.eyeR.center); v2("uEyeRR", RIG.eyeR.radius);
    v2("uBrowLC", RIG.browL.center); v2("uBrowLR", RIG.browL.radius); v2("uBrowLI", RIG.browL.inner);
    v2("uBrowRC", RIG.browR.center); v2("uBrowRR", RIG.browR.radius); v2("uBrowRI", RIG.browR.inner);
    gl.uniform3f(u.uLip, ...lipCurve(RIG.mouth));
    v2("uMouthL", RIG.mouth.left); v2("uMouthR", RIG.mouth.right);
    v2("uCheekL", RIG.cheekL); v2("uCheekR", RIG.cheekR); v2("uChin", RIG.chin);
    v2("uEarC", RIG.ear.center); v2("uEarR", RIG.ear.radius);
    v2("uChest", RIG.chestPivot);
  }

  #program(vs, fs) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
}
