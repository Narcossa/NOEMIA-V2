// Couleurs de l'appli : clair le jour (7 h – 19 h), sombre le soir, comme demandé au cahier des charges.
import { useEffect, useState } from "react";

const JOUR = {
  ink: "#141922", muted: "#5B6474", line: "#D2D8E1", panel: "#FFFFFF", panelSoft: "rgba(255,255,255,0.78)",
  bg: "#E7EBF0", halo: "#1F6FFF", haloGlow: "rgba(31,111,255,0.45)", btn: "#10141C", btnInk: "#CFE0FF", danger: "#C62F2F",
};
const NUIT = {
  ink: "#E8ECF2", muted: "#8F99AA", line: "#262D38", panel: "#12161E", panelSoft: "rgba(18,22,30,0.82)",
  bg: "#07090D", halo: "#4E92FF", haloGlow: "rgba(78,146,255,0.55)", btn: "#10141C", btnInk: "#CFE0FF", danger: "#FF8A80",
};
export type Palette = typeof JOUR;

const isDay = () => { const h = new Date().getHours(); return h >= 7 && h < 19; };

export function useDaylight(): { mode: "jour" | "nuit"; c: Palette } {
  const [day, setDay] = useState(isDay());
  useEffect(() => { const id = setInterval(() => setDay(isDay()), 60_000); return () => clearInterval(id); }, []);
  return { mode: day ? "jour" : "nuit", c: day ? JOUR : NUIT };
}
