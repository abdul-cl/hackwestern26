// Moving a search between devices. A link like  carescout://find?city=London%2C%20ON&postal=N6A%203K7
// opens the Find tab with the form already filled in (and runs the demo if demo=1).
// Linking.createURL makes the right kind of link for wherever the app is running:
// exps://... in Expo Go, carescout://... in a real build, http(s)://.../find on web
import * as Linking from "expo-linking";
import { COVERAGE_OPTIONS, LANGUAGE_OPTIONS, type Search } from "./config";
import { formatPostal } from "./device";

export type HandoffParams = { city?: string; postal?: string; coverage?: string; language?: string; demo?: string };

export function searchLink(s: Search) {
  return Linking.createURL("/find", {
    queryParams: {
      city: s.city.trim(),
      postal: s.postalCode.trim(),
      coverage: s.coverage,
      language: s.language,
      ...(s.useCache ? { demo: "1" } : {}),
    },
  });
}

// turns link params into form changes, ignoring anything that isn't a value the form allows.
// links can come from anywhere (a QR on a poster, a text), so nothing is trusted as-is
export function searchFromParams(p: HandoffParams): Partial<Search> {
  const out: Partial<Search> = {};
  if (typeof p.city === "string" && p.city.trim()) out.city = p.city.trim().slice(0, 100);
  if (typeof p.postal === "string" && p.postal.trim()) out.postalCode = formatPostal(p.postal).slice(0, 12);
  if (typeof p.coverage === "string" && COVERAGE_OPTIONS.includes(p.coverage)) out.coverage = p.coverage;
  if (typeof p.language === "string" && LANGUAGE_OPTIONS.includes(p.language)) out.language = p.language;
  return out;
}
