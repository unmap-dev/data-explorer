/**
 * Reading a GeoJSON file the reader opened. Everything happens here, in the browser; the file is
 * sent nowhere.
 *
 * GeoJSON (RFC 7946) is longitude, latitude in WGS 84. The common ways a file is not that are
 * refused with the reason rather than drawn in the wrong place: TopoJSON, a `crs` naming another
 * system, projected coordinates (metres, not degrees), positions out of range and broken shapes.
 * Features with no geometry are counted and left out, since there is nothing to draw.
 */

/** The largest file read. Bigger files are better served as vector tiles than parsed in a tab. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type GeoJsonErrorCode =
  | "too-large"
  | "json"
  | "topojson"
  | "not-geojson"
  | "crs"
  | "projected"
  | "out-of-range"
  | "geometry"
  | "empty";

export class GeoJsonError extends Error {
  constructor(
    readonly code: GeoJsonErrorCode,
    /** What to point at: a feature number, a CRS name, a sample position. */
    readonly where?: string,
  ) {
    super(where ? `${code}: ${where}` : code);
    this.name = "GeoJsonError";
  }
}

type Position = [number, number, ...number[]];
export type Geometry =
  | { type: "Point"; coordinates: Position }
  | { type: "MultiPoint"; coordinates: Position[] }
  | { type: "LineString"; coordinates: Position[] }
  | { type: "MultiLineString"; coordinates: Position[][] }
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type GeometryKind = "point" | "line" | "polygon";

/** One drawable feature. `id` is its position in the dataset, used by the map, table and export. */
export interface DataFeature {
  id: number;
  kind: GeometryKind;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface Dataset {
  name: string;
  features: DataFeature[];
  /** Features left out because they had no geometry. */
  skipped: number;
  /** West, south, east, north. */
  bbox: [number, number, number, number];
  kinds: Record<GeometryKind, number>;
}

const KIND: Record<Geometry["type"], GeometryKind> = {
  Point: "point",
  MultiPoint: "point",
  LineString: "line",
  MultiLineString: "line",
  Polygon: "polygon",
  MultiPolygon: "polygon",
};

/** The CRS names that mean "longitude, latitude in WGS 84", the only system GeoJSON allows. */
const WGS84 = /CRS84$|EPSG:{1,2}4326$|^EPSG:4326$/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Every position in a coordinates array, however deeply nested. */
function positions(coordinates: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(coordinates) && coordinates.length > 0 && typeof coordinates[0] === "number") out.push(coordinates);
  else if (Array.isArray(coordinates)) for (const part of coordinates) positions(part, out);
  return out;
}

const isPosition = (value: unknown): value is Position =>
  Array.isArray(value) && value.length >= 2 && value.every((n) => typeof n === "number" && Number.isFinite(n));

/** Whether the nesting and counts are a valid shape of this type: rings closed, lines of two. */
function wellFormed(type: Geometry["type"], c: unknown): boolean {
  const list = (v: unknown): v is unknown[] => Array.isArray(v);
  const line = (v: unknown) => list(v) && v.length >= 2 && v.every(isPosition);
  const ring = (v: unknown) => {
    if (!list(v) || v.length < 4 || !v.every(isPosition)) return false;
    const [first, last] = [v[0] as Position, v[v.length - 1] as Position];
    return first[0] === last[0] && first[1] === last[1];
  };
  const polygon = (v: unknown) => list(v) && v.length >= 1 && v.every(ring);
  switch (type) {
    case "Point":
      return isPosition(c);
    case "MultiPoint":
      return list(c) && c.every(isPosition);
    case "LineString":
      return line(c);
    case "MultiLineString":
      return list(c) && c.every(line);
    case "Polygon":
      return polygon(c);
    case "MultiPolygon":
      return list(c) && c.every(polygon);
  }
}

/** The geometries a feature draws: itself, or each member of a GeometryCollection. */
function geometriesOf(geometry: unknown, where: string): Geometry[] {
  if (!isRecord(geometry)) throw new GeoJsonError("geometry", where);
  if (geometry.type === "GeometryCollection") {
    if (!Array.isArray(geometry.geometries)) throw new GeoJsonError("geometry", where);
    return geometry.geometries.flatMap((member) => geometriesOf(member, where));
  }
  const type = geometry.type as Geometry["type"];
  if (!(type in KIND) || !wellFormed(type, geometry.coordinates)) throw new GeoJsonError("geometry", where);
  return [{ type, coordinates: geometry.coordinates } as Geometry];
}

/** Refuses positions that are not longitude, latitude: metres from a projection, or out of range. */
function checkRange(geometry: Geometry, where: string): void {
  for (const p of positions(geometry.coordinates) as Position[]) {
    const [x, y] = p;
    if (Math.abs(x) <= 180 && Math.abs(y) <= 90) continue;
    // Thousands or more is a projected system (UTM, a state plane, Web Mercator), not degrees.
    if (Math.abs(x) > 1000 || Math.abs(y) > 1000) throw new GeoJsonError("projected", `${x}, ${y}`);
    throw new GeoJsonError("out-of-range", where);
  }
}

function extend(bbox: [number, number, number, number], geometry: Geometry) {
  for (const [x, y] of positions(geometry.coordinates) as Position[]) {
    if (x < bbox[0]) bbox[0] = x;
    if (y < bbox[1]) bbox[1] = y;
    if (x > bbox[2]) bbox[2] = x;
    if (y > bbox[3]) bbox[3] = y;
  }
}

/** Parse and check a file's text. Throws a GeoJsonError naming the problem. */
export function parseGeoJson(text: string, name: string): Dataset {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    throw new GeoJsonError("json");
  }
  if (!isRecord(root)) throw new GeoJsonError("not-geojson");
  if (root.type === "Topology") throw new GeoJsonError("topojson");

  if (isRecord(root.crs)) {
    const crs = isRecord(root.crs.properties) ? String(root.crs.properties.name ?? "") : "";
    if (!WGS84.test(crs)) throw new GeoJsonError("crs", crs || "?");
  }

  const raw: unknown[] =
    root.type === "FeatureCollection" && Array.isArray(root.features)
      ? root.features
      : root.type === "Feature"
        ? [root]
        : typeof root.type === "string" && (root.type in KIND || root.type === "GeometryCollection")
          ? [{ type: "Feature", properties: {}, geometry: root }]
          : (() => {
              throw new GeoJsonError("not-geojson");
            })();

  const features: DataFeature[] = [];
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  const kinds: Record<GeometryKind, number> = { point: 0, line: 0, polygon: 0 };
  let skipped = 0;
  raw.forEach((entry, index) => {
    const where = String(index + 1);
    if (!isRecord(entry) || entry.type !== "Feature") throw new GeoJsonError("not-geojson", where);
    if (entry.geometry === null || entry.geometry === undefined) {
      skipped++;
      return;
    }
    const properties = isRecord(entry.properties) ? entry.properties : {};
    for (const geometry of geometriesOf(entry.geometry, where)) {
      checkRange(geometry, where);
      extend(bbox, geometry);
      const kind = KIND[geometry.type];
      kinds[kind]++;
      features.push({ id: features.length, kind, geometry, properties });
    }
  });
  if (features.length === 0) throw new GeoJsonError("empty");
  return { name, features, skipped, bbox, kinds };
}

/** Features as a FeatureCollection, with their ids, for the map. */
export function toCollection(features: readonly DataFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: features.map((f) => ({ type: "Feature" as const, id: f.id, geometry: f.geometry, properties: f.properties })),
  };
}

/** Features as a FeatureCollection a reader can save: plain RFC 7946, no ids of ours. */
export function exportCollection(features: readonly DataFeature[]): string {
  return JSON.stringify({
    type: "FeatureCollection",
    features: features.map((f) => ({ type: "Feature", properties: f.properties, geometry: f.geometry })),
  });
}

/** The west, south, east, north of some features, or null for none. */
export function boundsOf(features: readonly DataFeature[]): [number, number, number, number] | null {
  if (!features.length) return null;
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of features) extend(bbox, f.geometry);
  return bbox;
}
