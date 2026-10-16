#!/usr/bin/env node
/**
 * Refresh the sample dataset: the City of Calgary's community district boundaries, from the
 * city's open data portal, written to data/calgary-communities.geojson.
 *
 * Only the published attributes a reader can filter and colour by are kept, and coordinates are
 * rounded to 5 decimals (about a metre). Nothing else is changed: the shapes, names and classes
 * are the city's. The file is about 1.8 MB, fetched only when a reader asks for the sample.
 *
 *   node scripts/fetch-sample.mjs
 *
 * Licence: Open Government Licence - City of Calgary. The attribution is in DATA_SOURCES.md and in
 * the app, under the map.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const URL = "https://data.calgary.ca/resource/surr-xmvs.geojson?$limit=5000";
const KEEP = ["name", "comm_code", "sector", "class", "srg", "comm_structure"];

const round = (value) =>
  Array.isArray(value) ? value.map(round) : typeof value === "number" ? Math.round(value * 1e5) / 1e5 : value;

const response = await fetch(URL, { headers: { accept: "application/geo+json" } });
if (!response.ok) throw new Error(`data.calgary.ca answered ${response.status}`);
const source = await response.json();
if (source.type !== "FeatureCollection" || !Array.isArray(source.features)) throw new Error("not a FeatureCollection");

const features = source.features
  .filter((f) => f.geometry)
  .map((f) => ({
    type: "Feature",
    properties: Object.fromEntries(KEEP.map((key) => [key, f.properties?.[key] ?? null])),
    geometry: { type: f.geometry.type, coordinates: round(f.geometry.coordinates) },
  }))
  .sort((a, b) => String(a.properties.name).localeCompare(String(b.properties.name)));

const out = path.join(process.cwd(), "data", "calgary-communities.geojson");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ type: "FeatureCollection", features })}\n`);
console.log(`[sample] ${features.length} community districts -> data/calgary-communities.geojson`);
