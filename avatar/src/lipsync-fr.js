// Synchronisation labiale simplifiée pour le français.
// Un mot écrit est découpé en « visèmes » (formes de bouche) : ouverture de la mâchoire et largeur des lèvres.
// Ce n'est pas de la phonétique exacte : il suffit que la bouche bouge au bon rythme avec les bonnes formes.

const V = {
  A: { jaw: 0.85, w: 0.3 },   // a, à, â
  E: { jaw: 0.5, w: 0.55 },   // é, è, ai, ei
  EU: { jaw: 0.4, w: -0.3 },  // e, eu, œu
  I: { jaw: 0.25, w: 0.95 },  // i, y
  O: { jaw: 0.55, w: -0.6 },  // o, au, eau
  OU: { jaw: 0.25, w: -0.95 },// ou, u
  AN: { jaw: 0.6, w: -0.1 },  // an, en, on, in (nasales)
  MBP: { jaw: 0.0, w: 0.0 },  // lèvres fermées
  FV: { jaw: 0.1, w: 0.2 },
  CONS: { jaw: 0.22, w: 0.15 },
  REST: { jaw: 0.0, w: 0.0 },
};

// Graphèmes à plusieurs lettres, du plus long au plus court
const MULTI = [
  ["eaux", "O"], ["eau", "O"], ["oin", "AN"], ["ain", "AN"], ["ein", "AN"],
  ["ou", "OU"], ["oi", "A"], ["au", "O"], ["ai", "E"], ["ei", "E"], ["eu", "EU"], ["œu", "EU"],
  ["an", "AN"], ["am", "AN"], ["en", "AN"], ["em", "AN"], ["on", "AN"], ["om", "AN"], ["in", "AN"], ["im", "AN"], ["un", "AN"],
  ["ch", "CONS"], ["ph", "FV"], ["gn", "CONS"], ["qu", "CONS"],
];

const SINGLE = {
  a: "A", à: "A", â: "A", e: "EU", é: "E", è: "E", ê: "E", ë: "E", i: "I", î: "I", ï: "I", y: "I",
  o: "O", ô: "O", u: "OU", ù: "OU", û: "OU",
  m: "MBP", b: "MBP", p: "MBP", f: "FV", v: "FV",
};

function stripSilent(w) {
  if (w.length > 3 && w.endsWith("ent")) w = w.slice(0, -2);        // ils parlent
  while (w.length > 2 && /[stxdz]$/.test(w)) w = w.slice(0, -1);     // lettres finales muettes
  if (w.length > 2 && w.endsWith("e")) w = w.slice(0, -1);           // e muet final
  return w;
}

export function wordToVisemes(word) {
  let w = stripSilent(word.toLowerCase().replace(/[^a-zàâäéèêëîïôöùûüçœ]/g, ""));
  const out = [];
  let i = 0;
  while (i < w.length) {
    const m = MULTI.find(([g]) => w.startsWith(g, i));
    // une nasale suivie d'une voyelle n'est pas nasale (« ami », « bonne »)
    if (m && !(m[1] === "AN" && /[aeiouyéèê]/.test(w[i + m[0].length] || ""))) {
      out.push(V[m[1]]); i += m[0].length; continue;
    }
    const c = w[i];
    if (c === "h") { i++; continue; }
    out.push(V[SINGLE[c] || "CONS"]);
    i++;
  }
  // deux consonnes de suite : on garde la bouche en mouvement sans multiplier les fermetures
  return out.filter((v, k) => k === 0 || v !== out[k - 1]);
}

// Programme les formes de bouche d'un mot à partir de l'instant t0 (secondes)
export function scheduleWord(word, t0, duration) {
  const vis = wordToVisemes(word);
  if (!vis.length) return [];
  const step = duration / vis.length;
  return vis.map((v, k) => ({ t: t0 + k * step, jaw: v.jaw, w: v.w }));
}

// Durée estimée d'un mot prononcé, en secondes
export function estimateDuration(word, rate = 1) {
  return Math.max(0.16, wordToVisemes(word).length * 0.085) / rate;
}

export const REST = V.REST;
