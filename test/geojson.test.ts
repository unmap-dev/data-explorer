import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GeoJsonError, boundsOf, exportCollection, parseGeoJson, toCollection } from "@/lib/geojson";

const square = [
  [
    [-114.1, 51.0],
    [-114.0, 51.0],
    [-114.0, 51.1],
    [-114.1, 51.1],
    [-114.1, 51.0],
  ],
];

const fc = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
const feature = (geometry: unknown, properties: unknown = {}) => ({ type: "Feature", properties, geometry });

function refused(text: string): GeoJsonError {
  try {
    parseGeoJson(text, "x.geojson");
  } catch (error) {
    if (error instanceof GeoJsonError) return error;
    throw error;
  }
  throw new Error("accepted");
}

describe("reading a GeoJSON file", () => {
  it("reads points, lines and polygons, counts them, and bounds them", () => {
    const data = parseGeoJson(
      fc(
        feature({ type: "Point", coordinates: [-114.07, 51.05] }, { name: "a" }),
        feature({ type: "LineString", coordinates: [[-114.2, 51.0], [-114.1, 51.2]] }),
        feature({ type: "Polygon", coordinates: square }),
      ),
      "x.geojson",
    );
    expect(data.features.map((f) => f.kind)).toEqual(["point", "line", "polygon"]);
    expect(data.kinds).toEqual({ point: 1, line: 1, polygon: 1 });
    expect(data.bbox).toEqual([-114.2, 51.0, -114.0, 51.2]);
    expect(data.features.map((f) => f.id)).toEqual([0, 1, 2]);
  });

  it("accepts a lone Feature, a bare geometry and a GeometryCollection, which it splits", () => {
    expect(parseGeoJson(JSON.stringify(feature({ type: "Point", coordinates: [0, 0] })), "f").features).toHaveLength(1);
    expect(parseGeoJson(JSON.stringify({ type: "Point", coordinates: [0, 0] }), "g").features).toHaveLength(1);
    const collection = parseGeoJson(
      fc(feature({ type: "GeometryCollection", geometries: [{ type: "Point", coordinates: [0, 0] }, { type: "Polygon", coordinates: square }] }, { k: 1 })),
      "c",
    );
    expect(collection.features.map((f) => [f.kind, f.properties.k])).toEqual([["point", 1], ["polygon", 1]]);
  });

  it("leaves out features with no geometry and says how many", () => {
    const data = parseGeoJson(fc(feature(null), feature({ type: "Point", coordinates: [1, 1] })), "x");
    expect(data.features).toHaveLength(1);
    expect(data.skipped).toBe(1);
  });

  it("accepts a crs that names WGS 84 and refuses any other", () => {
    const withCrs = (name: string) => JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name } }, features: [feature({ type: "Point", coordinates: [1, 1] })] });
    expect(parseGeoJson(withCrs("urn:ogc:def:crs:OGC:1.3:CRS84"), "x").features).toHaveLength(1);
    expect(parseGeoJson(withCrs("urn:ogc:def:crs:EPSG::4326"), "x").features).toHaveLength(1);
    const error = refused(withCrs("urn:ogc:def:crs:EPSG::3400"));
    expect([error.code, error.where]).toEqual(["crs", "urn:ogc:def:crs:EPSG::3400"]);
  });

  it("names each way a file is not GeoJSON", () => {
    expect(refused("{nope").code).toBe("json");
    expect(refused(JSON.stringify({ type: "Topology", objects: {} })).code).toBe("topojson");
    expect(refused(JSON.stringify({ hello: "world" })).code).toBe("not-geojson");
    expect(refused(fc()).code).toBe("empty");
    expect(refused(fc(feature(null))).code).toBe("empty");
  });

  it("refuses projected coordinates and out-of-range positions with where they are", () => {
    const projected = refused(fc(feature({ type: "Point", coordinates: [705123.4, 5656789.1] })));
    expect([projected.code, projected.where]).toEqual(["projected", "705123.4, 5656789.1"]);
    const range = refused(fc(feature({ type: "Point", coordinates: [1, 1] }), feature({ type: "Point", coordinates: [190, 10] })));
    expect([range.code, range.where]).toEqual(["out-of-range", "2"]);
  });

  it("refuses broken shapes: a one-point line, an open ring, an unknown type", () => {
    expect(refused(fc(feature({ type: "LineString", coordinates: [[0, 0]] }))).code).toBe("geometry");
    expect(refused(fc(feature({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] }))).code).toBe("geometry");
    expect(refused(fc(feature({ type: "Circle", coordinates: [0, 0] }))).code).toBe("geometry");
  });

  it("exports plain RFC 7946 without its own ids, and keeps them for the map", () => {
    const data = parseGeoJson(fc(feature({ type: "Point", coordinates: [1, 2] }, { a: 1 })), "x");
    expect(JSON.parse(exportCollection(data.features))).toEqual({ type: "FeatureCollection", features: [{ type: "Feature", properties: { a: 1 }, geometry: { type: "Point", coordinates: [1, 2] } }] });
    expect(toCollection(data.features).features[0]!.id).toBe(0);
    expect(boundsOf([])).toBeNull();
  });

  it("reads the bundled sample", () => {
    const text = readFileSync(join(__dirname, "..", "data", "calgary-communities.geojson"), "utf8");
    const data = parseGeoJson(text, "calgary-communities.geojson");
    expect(data.features.length).toBeGreaterThan(300);
    expect(data.kinds.polygon).toBe(data.features.length);
    expect(Object.keys(data.features[0]!.properties)).toEqual(["name", "comm_code", "sector", "class", "srg", "comm_structure"]);
  });
});
