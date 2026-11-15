import es from "../../messages/es.json";
import en from "../../messages/en.json";
export const dictionaries = { es, en };
export type Locale = keyof typeof dictionaries;
export const sections = [
  "mapa",
  "actualidad",
  "prevencion",
  "laboratorio",
  "zonas",
  "respuesta",
] as const;
export type Section = (typeof sections)[number];
