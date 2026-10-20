// Page de démonstration de l'étape 0 : NOÉMIA vivante, sans cerveau pour l'instant.
import { NoemiaRenderer } from "./renderer.js";
import { Life, HALO_STATES, EMOTION_NAMES } from "./life.js";
import { Voice, onVoicesReady } from "./voice.js";
import { Backdrop, headOnScreen } from "./backdrop.js";
import { IMAGE, RIG } from "./rig.js";

const $ = s => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// Thème selon l'heure : clair de 7h à 19h, sombre sinon
function applyDaylight() {
  const h = new Date().getHours();
  document.documentElement.dataset.daylight = h >= 7 && h < 19 ? "jour" : "nuit";
}
applyDaylight();
setInterval(applyDaylight, 60_000);

const life = new Life();
const voice = new Voice(life);
window.noemia = { life, voice }; // accès console pour le réglage
let renderer;
const showError = err => { $("#subtitle").textContent = "Impossible d'afficher NOÉMIA sur cet appareil : " + err.message; };
try {
  renderer = new NoemiaRenderer($("#avatar"));
  renderer.load().catch(showError);
} catch (err) { showError(err); }

const backdrop = new Backdrop($("#backdrop"));
let last = performance.now();
function frame(now) {
  const dt = (now - last) / 1000; last = now;
  const s = life.update(dt);
  backdrop.draw(s, life.t, dt, headOnScreen($("#avatar"), RIG, IMAGE));
  renderer?.draw(s, life.t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Sous-titres
const sub = $("#subtitle");
function showSubtitle(text, who = "noemia") {
  sub.innerHTML = "";
  const span = document.createElement("span");
  span.className = who;
  span.textContent = who === "toi" ? `« ${text} »` : text;
  sub.appendChild(span);
}

// Parole : réflexion courte, puis elle parle avec une émotion
let busy = false;
async function speak(text, emotion = "neutre") {
  busy = true;
  setMic("parole");
  life.setHalo("reflexion");
  await new Promise(r => setTimeout(r, 450));
  life.setEmotion(emotion);
  life.setHalo("parole");
  showSubtitle(text);
  await voice.say(text);
  life.setHalo("repos");
  setMic("repos");
  busy = false;
  setTimeout(() => { if (!busy) life.setEmotion("neutre"); }, 1400);
}

const DEMO = [
  ["Bonjour Mathis. Je suis NOÉMIA. Tu m'as créée, alors maintenant, c'est moi qui veille sur toi.", "sourire"],
  ["Tu as une réunion dans dix minutes avec Sophie. Je t'ai préparé un résumé de ses derniers messages.", "concentration"],
  ["Tu m'avais dit : plus de café après seize heures. Il est seize heures trente. Je dis ça, je dis rien.", "amusee"],
  ["Il va pleuvoir à dix-sept heures. Pense à prendre un parapluie avant de partir sur le chantier.", "inquietude"],
  ["C'est fait : la réunion est dans ton agenda, et Sophie a confirmé sa présence.", "joie"],
];
let demoIndex = 0;

// Réponses de démonstration à ce que tu dis (l'intelligence arrive à l'étape 1)
function reply(heard) {
  const h = heard.toLowerCase();
  if (/bonjour|salut|coucou|hello/.test(h)) return ["Bonjour Mathis. Je suis là. Qu'est-ce que je peux faire pour toi ?", "sourire"];
  if (/qui es-tu|qui est tu|tu es qui|ton nom/.test(h)) return ["Je suis NOÉMIA. Mathis m'a créée pour veiller sur le quotidien de la famille.", "sourire"];
  if (/heure/.test(h)) {
    const d = new Date();
    return [`Il est ${d.getHours()} heures ${d.getMinutes().toString().padStart(2, "0")}.`, "neutre"];
  }
  if (/blague|drôle|rigol/.test(h)) return ["Pourquoi les robots ne paniquent jamais ? Parce qu'ils ont toujours une sauvegarde.", "amusee"];
  if (/merci/.test(h)) return ["Avec plaisir. C'est mon travail, et j'aime bien le faire.", "joie"];
  return ["Je t'ai bien entendu. Pour l'instant je ne suis qu'un prototype : à l'étape suivante, je pourrai vraiment m'en occuper.", "sourire"];
}

// Bouton micro
const mic = $("#mic");
function setMic(state) { mic.dataset.state = state; mic.setAttribute("aria-label", state === "ecoute" ? "Arrêter l'écoute" : state === "parole" ? "Interrompre NOÉMIA" : "Parler à NOÉMIA"); }
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recog = null;

mic.addEventListener("click", () => {
  if (mic.dataset.state === "parole") { voice.stop(); life.setHalo("repos"); setMic("repos"); busy = false; return; }
  if (mic.dataset.state === "ecoute") { recog?.stop(); return; }
  life.setHalo("ecoute");
  life.setEmotion("neutre");
  setMic("ecoute");
  showSubtitle("Je t'écoute…");

  if (!Recognition) {
    // Pas de micro disponible : elle enchaîne sur une phrase de démonstration
    setTimeout(() => { const [t, e] = DEMO[demoIndex++ % DEMO.length]; speak(t, e); }, 1800);
    return;
  }
  recog = new Recognition();
  recog.lang = "fr-FR";
  recog.interimResults = true;
  let finalText = "";
  recog.onresult = ev => {
    const text = Array.from(ev.results).map(r => r[0].transcript).join(" ");
    showSubtitle(text, "toi");
    if (ev.results[ev.results.length - 1].isFinal) finalText = text;
  };
  recog.onerror = () => { finalText = finalText || ""; };
  recog.onend = () => {
    recog = null;
    if (finalText) { const [t, e] = reply(finalText); speak(t, e); }
    else { const [t, e] = DEMO[demoIndex++ % DEMO.length]; speak(t, e); }
  };
  try { recog.start(); } catch { recog.onend(); }
});

// Laboratoire : tester voix, phrases, émotions et halo
const lab = $("#lab");
$("#lab-toggle").addEventListener("click", () => { lab.hidden = !lab.hidden; $("#lab-toggle").setAttribute("aria-expanded", String(!lab.hidden)); });
$("#lab-close").addEventListener("click", () => { lab.hidden = true; $("#lab-toggle").setAttribute("aria-expanded", "false"); });

const demoBox = $("#demo-lines");
DEMO.forEach(([text, emo]) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "line"; b.textContent = text;
  b.addEventListener("click", () => speak(text, emo));
  demoBox.appendChild(b);
});

$("#say-form").addEventListener("submit", ev => {
  ev.preventDefault();
  const t = $("#say-text").value.trim();
  if (t) speak(t, $("#say-emotion").value);
});

const LABELS = { neutre: "Neutre", sourire: "Sourire", joie: "Joie", amusee: "Amusée", concentration: "Concentration", inquietude: "Inquiétude", surprise: "Surprise",
  repos: "Repos", ecoute: "Écoute", reflexion: "Réflexion", parole: "Parole", action: "Action", probleme: "Problème" };

const emoSel = $("#say-emotion");
EMOTION_NAMES.forEach(n => emoSel.add(new Option(LABELS[n], n)));
emoSel.value = "sourire";

function chips(box, names, onPick, current) {
  names.forEach(n => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = LABELS[n];
    b.setAttribute("aria-pressed", String(n === current));
    b.addEventListener("click", () => {
      box.querySelectorAll(".chip").forEach(c => c.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
      onPick(n);
    });
    box.appendChild(b);
  });
}
chips($("#emotions"), EMOTION_NAMES, n => life.setEmotion(n), "neutre");
chips($("#halos"), HALO_STATES, n => life.setHalo(n), "repos");

// Choix de la voix
const voiceSel = $("#voice");
onVoicesReady(list => {
  const saved = store.get("noemia-voice");
  voiceSel.innerHTML = "";
  if (!list.length) { voiceSel.add(new Option("Aucune voix française trouvée", "")); voiceSel.disabled = true; return; }
  voiceSel.disabled = false;
  list.forEach(v => voiceSel.add(new Option(`${v.name} (${v.lang})`, v.voiceURI)));
  const pick = list.find(v => v.voiceURI === saved) || list[0];
  voiceSel.value = pick.voiceURI;
  voice.voice = pick;
  $("#voice-count").textContent = `${list.length} voix française${list.length > 1 ? "s" : ""} sur cet appareil`;
});
voiceSel.addEventListener("change", () => {
  const v = speechSynthesis.getVoices().find(x => x.voiceURI === voiceSel.value);
  if (v) { voice.voice = v; store.set("noemia-voice", v.voiceURI); speak("Voici ma voix. Elle te plaît ?", "sourire"); }
});
$("#rate").addEventListener("input", e => { voice.rate = Number(e.target.value); $("#rate-val").textContent = voice.rate.toFixed(2); });

setMic("repos");
showSubtitle("Touche le bouton pour me parler.");
