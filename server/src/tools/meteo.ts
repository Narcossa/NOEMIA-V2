// Météo par Open-Meteo (gratuit, sans clé). Position : celle de l'iPhone, ou une ville demandée.
import { tool, str, type Ctx } from "./types.ts";

// Codes météo WMO → libellé et icône SF Symbols
const CODES: [number[], string, string][] = [
  [[0], "Ensoleillé", "sun.max.fill"], [[1, 2], "Éclaircies", "cloud.sun.fill"], [[3], "Couvert", "cloud.fill"],
  [[45, 48], "Brouillard", "cloud.fog.fill"], [[51, 53, 55, 56, 57], "Bruine", "cloud.drizzle.fill"],
  [[61, 63, 65, 66, 67, 80, 81, 82], "Pluie", "cloud.rain.fill"], [[71, 73, 75, 77, 85, 86], "Neige", "cloud.snow.fill"],
  [[95, 96, 99], "Orage", "cloud.bolt.rain.fill"],
];
export const describe = (code: number) => {
  const c = CODES.find(([codes]) => codes.includes(code));
  return { libelle: c?.[1] ?? "Variable", icone: c?.[2] ?? "cloud.sun.fill" };
};

async function geocode(ville: string) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ville)}&count=1&language=fr`);
  const j: any = await r.json();
  const g = j.results?.[0];
  if (!g) throw new Error(`Ville introuvable : ${ville}`);
  return { lat: g.latitude as number, lon: g.longitude as number, nom: g.name as string };
}

export async function forecast(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`
    + `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`;
  const j: any = await (await fetch(url)).json();
  return {
    maintenant: { temperature: Math.round(j.current.temperature_2m), ...describe(j.current.weather_code) },
    jours: (j.daily.time as string[]).map((date, i) => ({
      date, min: Math.round(j.daily.temperature_2m_min[i]), max: Math.round(j.daily.temperature_2m_max[i]),
      pluie: j.daily.precipitation_probability_max?.[i] ?? null, ...describe(j.daily.weather_code[i]),
    })),
  };
}

export const meteoTools = [
  tool("meteo", "Météo actuelle et prévisions sur 7 jours (affichées en carte). Sans ville : à l'endroit où se trouve l'utilisateur.",
    { ville: str("Ville (optionnel)") }, [],
    async (ctx: Ctx, { ville }) => {
      let lat = ctx.device?.lat, lon = ctx.device?.lon, nom = ctx.device?.ville ?? "ici";
      if (ville) ({ lat, lon, nom } = await geocode(ville));
      if (lat === undefined || lon === undefined) return { erreur: "Je ne connais pas ta position : précise une ville." };
      const f = await forecast(lat, lon);
      ctx.cards.push({ kind: "meteo", eyebrow: `Météo · ${nom}`, title: `${f.maintenant.temperature}° · ${f.maintenant.libelle}`, data: { lieu: nom, ...f } });
      return { lieu: nom, ...f };
    }),
];
