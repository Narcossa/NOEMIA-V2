// Repères du visage de NOÉMIA, en pixels de l'image source (assets/noemia.webp, 862 × 1146).
// Relevés à la main sur la photo. Si l'image change, seuls ces chiffres sont à reprendre.

export const IMAGE = { src: "assets/noemia.webp", width: 862, height: 1146 };

export const RIG = {
  // Tête : zone qui suit les mouvements, pivot à la base du cou
  head: { center: [465, 290], radius: [265, 320], pivot: [480, 620] },
  // Point le plus « en avant » du visage (sert à la parallaxe quand elle tourne la tête)
  faceFront: [620, 380],

  // Ouvertures des yeux : centre, demi-largeur, demi-hauteur
  eyeL: { center: [543, 278], radius: [36, 12] },
  eyeR: { center: [677, 297], radius: [25, 14] },

  // Sourcils
  browL: { center: [545, 238], radius: [45, 12], inner: [585, 248] },
  browR: { center: [685, 258], radius: [30, 10], inner: [660, 262] },

  // Bouche : commissures et point central de la ligne entre les lèvres
  mouth: { left: [558, 465], mid: [604, 465.5], right: [650, 473] },
  cheekL: [585, 418],
  cheekR: [668, 428],
  chin: [600, 586],

  // Halo de l'oreille (anneau bleu)
  ear: { center: [262, 315], radius: [36, 40] },

  // Point bas du buste, pivot de la respiration
  chestPivot: [431, 1146],
};

// Ligne entre les lèvres : parabole y = a·x² + b·x + c passant par les trois repères
export function lipCurve({ left, mid, right }) {
  const [x1, y1] = left, [x2, y2] = mid, [x3, y3] = right;
  const d = (x1 - x2) * (x1 - x3) * (x2 - x3);
  const a = (x3 * (y2 - y1) + x2 * (y1 - y3) + x1 * (y3 - y2)) / d;
  const b = (x3 * x3 * (y1 - y2) + x2 * x2 * (y3 - y1) + x1 * x1 * (y2 - y3)) / d;
  const c = (x2 * x3 * (x2 - x3) * y1 + x3 * x1 * (x3 - x1) * y2 + x1 * x2 * (x1 - x2) * y3) / d;
  return [a, b, c];
}
