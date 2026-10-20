// Emballe le moteur d'animation (../avatar) en une page HTML autonome pour la WebView de l'appli.
// La voix est gérée par l'iPhone (expo-speech) ; la page ne fait que l'image : vie, émotions, halo, lèvres.
// Lancé automatiquement avant chaque démarrage et chaque build (voir package.json).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const avatar = join(here, "..", "..", "avatar");
const out = join(here, "..", "src", "avatar", "avatarHtml.ts");

const strip = src => src
  .split("\n")
  .filter(l => !/^\s*import\s/.test(l))
  .map(l => l.replace(/^export\s+(?=(const|function|class|let|async))/, ""))
  .join("\n");

const modules = ["rig.js", "lipsync-fr.js", "renderer.js", "life.js"]
  .map(f => `// ---- ${f}\n${strip(readFileSync(join(avatar, "src", f), "utf8"))}`)
  .join("\n\n");

const image = "data:image/webp;base64," + readFileSync(join(avatar, "assets", "noemia.webp")).toString("base64");

const bridge = `
// ---- pont avec l'appli React Native
const life = new Life();
const renderer = new NoemiaRenderer(document.getElementById("avatar"));
const post = m => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
renderer.load(${JSON.stringify(image)}).then(() => post({ type: "ready" })).catch(e => post({ type: "error", message: e.message }));
let last = performance.now();
(function frame(now) {
  const dt = (now - last) / 1000; last = now;
  renderer.draw(life.update(dt), life.t);
  requestAnimationFrame(frame);
})(last);

function scheduleText(text, rate) {
  let t = life.t; const keys = [];
  for (const m of text.matchAll(/[\\p{L}'’-]+|[.,;:!?…]/gu)) {
    const tok = m[0];
    if (/^[.,;:!?…]$/.test(tok)) { keys.push({ t, jaw: 0, w: 0 }); t += /[,;:]/.test(tok) ? 0.18 : 0.35; continue; }
    const d = estimateDuration(tok, rate); keys.push(...scheduleWord(tok, t, d)); t += d + 0.04;
  }
  keys.push({ t, jaw: 0, w: 0 }); life.queueMouth(keys);
}

window.noemia = msg => {
  switch (msg.type) {
    case "halo": life.setHalo(msg.state); break;
    case "emotion": life.setEmotion(msg.name); break;
    case "speak": scheduleText(msg.text, msg.rate || 1); break;          // estimation globale
    case "word": {                                                       // mot réellement prononcé
      const d = estimateDuration(msg.word, msg.rate || 1);
      life.queueMouth([...scheduleWord(msg.word, life.t, d), { t: life.t + d, jaw: 0.05, w: 0 }]);
      break;
    }
    case "silence": life.closeMouth(); break;
    case "theme": document.documentElement.dataset.daylight = msg.value; break;
  }
};
post({ type: "boot" });
`;

const html = `<!doctype html><html data-daylight="jour"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
:root{--bg:#E7EBF0;--bg2:#F6F8FA;--glow:rgba(31,111,255,.35)}
:root[data-daylight="nuit"]{--bg:#07090D;--bg2:#121722;--glow:rgba(78,146,255,.45)}
html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);-webkit-user-select:none;user-select:none}
.stage{position:fixed;inset:0;background:radial-gradient(70% 55% at 55% 35%,var(--bg2),var(--bg) 70%);transition:background .6s}
.stage::after{content:"";position:absolute;inset:0;background:radial-gradient(40% 30% at 35% 30%,var(--glow),transparent 70%);opacity:.35}
#avatar{position:absolute;left:50%;bottom:0;transform:translateX(-61%);height:86vh;aspect-ratio:862/1146}
@media (min-aspect-ratio:3/4){#avatar{height:94vh;transform:translateX(-50%)}}
</style></head><body><div class="stage"></div><canvas id="avatar"></canvas>
<script>
(function(){
${modules}
${bridge}
})();
</script></body></html>`;

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `// Fichier généré par scripts/build-avatar.mjs — ne pas modifier à la main.\nexport const AVATAR_HTML = ${JSON.stringify(html)};\n`);
console.log(`Avatar emballé : ${(html.length / 1024).toFixed(0)} Ko → ${out}`);
