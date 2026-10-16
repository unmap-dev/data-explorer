import type { DataFeature } from "./geojson";

/**
 * A loaded dataset's attributes, and the client-side work on them: search, filtering by value and
 * colouring by an attribute. All of it runs on the features already in the page; none of it is a
 * request.
 */

/** A text attribute is colourable, and filterable value by value, up to this many distinct values. */
export const MAX_CATEGORIES = 12;

/** Classes a numeric attribute is coloured in. */
export const NUMERIC_CLASSES = 5;

export interface Attribute {
  key: string;
  kind: "number" | "text";
  /** Distinct values, sorted, up to MAX_CATEGORIES + 1 (one more says "too many"). Null excluded. */
  values: Array<string | number>;
  /** Distinct non-null values, counted in full. */
  distinct: number;
  /** Features with no value for it. */
  missing: number;
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "";

/** A value as text, for search, the table and categories. */
export function displayValue(value: unknown): string {
  if (isEmpty(value)) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Every attribute key, in the order the features first use them, with its kind and values. */
export function describeAttributes(features: readonly DataFeature[]): Attribute[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const f of features)
    for (const key of Object.keys(f.properties))
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
  return keys.map((key) => {
    const distinct = new Set<string | number>();
    let numeric = true;
    let missing = 0;
    for (const f of features) {
      const value = f.properties[key];
      if (isEmpty(value)) {
        missing++;
        continue;
      }
      if (typeof value !== "number" || !Number.isFinite(value)) numeric = false;
      distinct.add(typeof value === "number" ? value : displayValue(value));
    }
    const kind = numeric && distinct.size > 0 ? "number" : "text";
    const all = [...distinct].map((v) => (kind === "text" ? displayValue(v) : v));
    const values = [...new Set(all)]
      .sort((a, b) => (kind === "number" ? (a as number) - (b as number) : String(a).localeCompare(String(b))))
      .slice(0, MAX_CATEGORIES + 1);
    return { key, kind, values, distinct: new Set(all).size, missing };
  });
}

/** Whether an attribute can colour the map: a number with some spread, or a few categories. */
export const colourable = (a: Attribute) => (a.kind === "number" ? a.distinct > 1 : a.distinct > 0 && a.distinct <= MAX_CATEGORIES);

/** Whether its values can be switched off one by one. */
export const categorical = (a: Attribute) => a.kind === "text" && a.distinct > 0 && a.distinct <= MAX_CATEGORIES;

/** Case- and accent-insensitive, so "montreal" finds "Montréal". */
const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** The features with any attribute value containing the query. An empty query keeps them all. */
export function searchFeatures(features: readonly DataFeature[], query: string): DataFeature[] {
  const q = fold(query.trim());
  if (!q) return [...features];
  return features.filter((f) => Object.values(f.properties).some((value) => fold(displayValue(value)).includes(q)));
}

/** The features whose value for `key` is not one of the excluded ones. */
export function withoutValues(features: readonly DataFeature[], key: string, excluded: ReadonlyArray<string | number>): DataFeature[] {
  if (!excluded.length) return [...features];
  const out = new Set(excluded.map(String));
  return features.filter((f) => !out.has(displayValue(f.properties[key])));
}

/**
 * Colours for categories. A fixed palette rather than theme tokens: data colours have to tell ten
 * categories apart in both modes, which a design system's handful of chart colours cannot.
 * (Tableau 10, then two more from the same family.)
 */
export const CATEGORY_COLOURS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ac",
  "#86bcb6",
  "#d37295",
] as const;

/** A light-to-dark sequential ramp, readable on light and dark basemaps (viridis stops). */
export const NUMERIC_COLOURS = ["#fde725", "#5ec962", "#21918c", "#3b528b", "#440154"] as const;

/** The colour a feature with no value takes. */
export const NO_VALUE_COLOUR = "#9ca3af";

/** Quantile breaks: the lower bound of each class after the first. */
export function quantileBreaks(values: readonly number[], classes = NUMERIC_CLASSES): number[] {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 2) return [];
  const breaks: number[] = [];
  for (let i = 1; i < classes; i++) {
    const value = sorted[Math.floor((i * sorted.length) / classes)]!;
    if (value > sorted[0]! && (breaks.length === 0 || value > breaks[breaks.length - 1]!)) breaks.push(value);
  }
  return breaks;
}

export interface LegendEntry {
  label: string;
  colour: string;
  /** The category value, for switching it off; absent on a numeric class. */
  value?: string;
}

export interface ColourScheme {
  /** A MapLibre colour expression on the attribute. */
  expression: unknown;
  legend: LegendEntry[];
}

const range = (lo: number, hi: number | undefined, format: (n: number) => string) =>
  hi === undefined ? `≥ ${format(lo)}` : `${format(lo)} – ${format(hi)}`;

/** How to colour features by an attribute, with its legend. Null for one that cannot. */
export function colourScheme(
  attribute: Attribute,
  features: readonly DataFeature[],
  format: (n: number) => string,
  noValue: string,
): ColourScheme | null {
  if (!colourable(attribute)) return null;
  const get = ["get", attribute.key];
  if (attribute.kind === "text") {
    const values = attribute.values.map(String);
    const pairs = values.flatMap((value, i) => [value, CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]!]);
    const legend: LegendEntry[] = values.map((value, i) => ({ label: value, colour: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length]!, value }));
    if (attribute.missing) legend.push({ label: noValue, colour: NO_VALUE_COLOUR, value: "" });
    return { expression: ["match", ["to-string", ["coalesce", get, ""]], ...pairs, NO_VALUE_COLOUR], legend };
  }
  const numbers = features.map((f) => f.properties[attribute.key]).filter((v): v is number => typeof v === "number");
  const breaks = quantileBreaks(numbers);
  const min = Math.min(...numbers);
  const stops = breaks.flatMap((b, i) => [b, NUMERIC_COLOURS[i + 1]!]);
  const legend: LegendEntry[] = [min, ...breaks].map((lo, i, all) => ({ label: range(lo, all[i + 1], format), colour: NUMERIC_COLOURS[i]! }));
  if (attribute.missing) legend.push({ label: noValue, colour: NO_VALUE_COLOUR });
  return {
    expression: ["case", ["==", ["typeof", get], "number"], ["step", get, NUMERIC_COLOURS[0], ...stops], NO_VALUE_COLOUR],
    legend,
  };
}
