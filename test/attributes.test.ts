import { describe, expect, it } from "vitest";
import {
  CATEGORY_COLOURS,
  MAX_CATEGORIES,
  NO_VALUE_COLOUR,
  categorical,
  colourScheme,
  colourable,
  describeAttributes,
  quantileBreaks,
  searchFeatures,
  withoutValues,
} from "@/lib/attributes";
import type { DataFeature } from "@/lib/geojson";

const features = (rows: Record<string, unknown>[]): DataFeature[] =>
  rows.map((properties, id) => ({ id, kind: "point", geometry: { type: "Point", coordinates: [0, 0] }, properties }));

const data = features([
  { name: "Montréal", kind: "park", area: 10 },
  { name: "Calgary", kind: "school", area: 20 },
  { name: "Banff", kind: "park", area: null },
  { name: "Iqaluit", kind: null, area: 40 },
]);

describe("attributes", () => {
  it("lists every key in first-use order with its kind, values and gaps", () => {
    const [name, kind, area] = describeAttributes(data);
    expect(name).toMatchObject({ key: "name", kind: "text", distinct: 4, missing: 0 });
    expect(kind).toMatchObject({ key: "kind", kind: "text", values: ["park", "school"], distinct: 2, missing: 1 });
    expect(area).toMatchObject({ key: "area", kind: "number", values: [10, 20, 40], missing: 1 });
  });

  it("colours by numbers or by a few categories, never by a free-text column", () => {
    const many = describeAttributes(features(Array.from({ length: MAX_CATEGORIES + 1 }, (_, i) => ({ id: `v${i}` }))))[0]!;
    expect(colourable(many)).toBe(false);
    expect(categorical(many)).toBe(false);
    const [, kind, area] = describeAttributes(data);
    expect([colourable(kind!), categorical(kind!)]).toEqual([true, true]);
    expect([colourable(area!), categorical(area!)]).toEqual([true, false]);
  });

  it("searches every value, ignoring case and accents", () => {
    expect(searchFeatures(data, "montreal").map((f) => f.id)).toEqual([0]);
    expect(searchFeatures(data, "PARK").map((f) => f.id)).toEqual([0, 2]);
    expect(searchFeatures(data, "  ")).toHaveLength(4);
  });

  it("switches values off, including the missing one", () => {
    expect(withoutValues(data, "kind", ["park"]).map((f) => f.id)).toEqual([1, 3]);
    expect(withoutValues(data, "kind", [""]).map((f) => f.id)).toEqual([0, 1, 2]);
  });

  it("builds a categorical scheme with a colour per value and one for no value", () => {
    const kind = describeAttributes(data)[1]!;
    const scheme = colourScheme(kind, data, String, "No value")!;
    expect(scheme.legend).toEqual([
      { label: "park", colour: CATEGORY_COLOURS[0], value: "park" },
      { label: "school", colour: CATEGORY_COLOURS[1], value: "school" },
      { label: "No value", colour: NO_VALUE_COLOUR, value: "" },
    ]);
    expect(scheme.expression).toEqual(["match", ["to-string", ["coalesce", ["get", "kind"], ""]], "park", CATEGORY_COLOURS[0], "school", CATEGORY_COLOURS[1], NO_VALUE_COLOUR]);
  });

  it("classes numbers by quantile, with strictly rising breaks", () => {
    expect(quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([3, 5, 7, 9]);
    expect(quantileBreaks([5, 5, 5, 5])).toEqual([]);
    const area = describeAttributes(data)[2]!;
    const scheme = colourScheme(area, data, String, "No value")!;
    expect(scheme.legend.at(-1)).toEqual({ label: "No value", colour: NO_VALUE_COLOUR });
    expect(scheme.legend[0]!.label.startsWith("10")).toBe(true);
  });
});
