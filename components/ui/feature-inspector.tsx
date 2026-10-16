"use client";

/**
 * <FeatureInspector> - list the features under a click, or in view, in your shadcn Card and Table.
 *
 * Click the map and every feature drawn within a few pixels is listed, topmost first, with the
 * style layer that drew it. The topmost is selected: its properties are listed and its shape is
 * outlined on the map in your `--primary`. Click a row to select another, or the selected one to
 * clear it. `scope="view"` lists what is drawn in the whole view instead, again after every move,
 * up to `limit` rows.
 *
 * A feature cut across tiles is listed once. Features without an id that carry the same
 * properties in the same layer are one row. With an id a feature is outlined whole, from every
 * loaded tile: the pieces are drawn per tile and may overlap faintly at tile edges, and polygons
 * are filled, not stroked, so no tile seam is drawn through them. Without an id, or from a source
 * that promotes a property to the id (`promoteId`), the outline is the piece that was hit.
 * `layers` limits the query to some style layer ids (one ending in `*` matches every layer that
 * starts with the rest; ids the style lacks are skipped); by default every layer is queried except
 * the tools' own, such as a measurement or this outline. Querying reads what the map already drew:
 * it makes no request. With `scope="view"` a selection is kept across refreshes, and its row shows
 * as selected again when its feature comes back into view. The outline survives a style swap and
 * comes off the map when this unmounts.
 *
 * `enabled={false}` clears the list, the selection and the outline. The inspector and `<Measure>`
 * both answer map clicks, so toggle them to keep only one active at a time.
 *
 * Copied into your project by `npx shadcn add`. Edit freely.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { HELPER_KEY, accentColor, matchLayers, useLayerSet, type LayerSpec } from "@/lib/map-layers";
import { cn } from "@/lib/utils";

// --- inspector helpers (kept identical across both lanes) ---

/** Pixels around a click that count as a hit, so a thin line or a small point is easy to pick. */
export const INSPECT_TOLERANCE = 3;

/** A feature as the inspector lists it. */
export interface InspectedFeature {
  /** Unique in the list: the layer and the feature id, or the layer and the properties without an id. */
  key: string;
  /** The style layer that drew it. */
  layer: string;
  source: string;
  sourceLayer?: string;
  id?: string | number;
  properties: Record<string, unknown>;
  /** As drawn in the tile where it was found, so clipped to that tile. */
  geometry: unknown;
}

/** A feature as MapLibre's `queryRenderedFeatures` returns it. */
export interface RenderedFeature {
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry?: unknown;
  source?: string;
  sourceLayer?: string;
  layer?: { id: string; metadata?: unknown };
}

/** The part of a MapLibre map the outline reads the rest of a feature from. */
export interface InspectMap {
  querySourceFeatures(source: string, params?: { sourceLayer?: string; filter?: unknown } | null): Array<{ geometry?: unknown }>;
  getSource(id: string): unknown;
  getStyle(): { sources?: Record<string, unknown> } | undefined;
}

/** The part of a MapLibre click event the inspector reads. */
export interface MapClick {
  point: { x: number; y: number };
}

export const INSPECT_COPY = {
  en: {
    title: "Features",
    hint: "Click the map to list the features there.",
    emptyPoint: "Nothing here. Click a road, a place or your data.",
    emptyView: "No features in view.",
    feature: "Feature",
    layer: "Layer",
    properties: "Properties",
    property: "Property",
    value: "Value",
    unnamed: "Unnamed",
    count: (shown: number, total: number) =>
      shown < total ? `${shown} of ${total} features` : total === 1 ? "1 feature" : `${total} features`,
  },
  fr: {
    title: "Entités",
    hint: "Cliquez sur la carte pour lister les entités à cet endroit.",
    emptyPoint: "Rien ici. Cliquez sur une route, un lieu ou vos données.",
    emptyView: "Aucune entité dans la vue.",
    feature: "Entité",
    layer: "Couche",
    properties: "Propriétés",
    property: "Propriété",
    value: "Valeur",
    unnamed: "Sans nom",
    count: (shown: number, total: number) =>
      shown < total ? `${shown} sur ${total} entités` : total <= 1 ? `${total} entité` : `${total} entités`,
  },
} as const;

/**
 * The layer ids to query: the style layers `patterns` name, or `undefined` (every layer) without
 * patterns. MapLibre answers a query naming a layer the style lacks with an error and no features
 * at all, so only ids the style has are passed.
 */
export function queryLayers(styleIds: string[], patterns: string[] | undefined): string[] | undefined {
  return patterns ? matchLayers(styleIds, patterns) : undefined;
}

/**
 * The rendered features worth listing, topmost first: the tools' own layers dropped, and a feature
 * split across tiles listed once. Returns the first `limit` and how many there were.
 */
export function inspectFeatures(features: RenderedFeature[], limit: number): { features: InspectedFeature[]; total: number } {
  const seen = new Set<string>();
  const listed: InspectedFeature[] = [];
  for (const feature of features) {
    const layer = feature.layer;
    if (!layer || (layer.metadata as Record<string, unknown> | undefined)?.[HELPER_KEY] === true) continue;
    const properties = { ...(feature.properties ?? {}) };
    const source = feature.source ?? "";
    const key =
      feature.id !== undefined
        ? JSON.stringify([layer.id, source, feature.sourceLayer ?? null, feature.id])
        : JSON.stringify([layer.id, properties]);
    if (seen.has(key)) continue;
    seen.add(key);
    listed.push({
      key,
      layer: layer.id,
      source,
      ...(feature.sourceLayer ? { sourceLayer: feature.sourceLayer } : {}),
      ...(feature.id !== undefined ? { id: feature.id } : {}),
      properties,
      geometry: feature.geometry,
    });
  }
  return { features: listed.slice(0, limit), total: listed.length };
}

/** A name as text, or `undefined` when it is missing or blank. */
function nameText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() ? value : undefined;
  return typeof value === "number" ? String(value) : undefined;
}

/** A row's name: the feature's name in `lang`, its name, its id, or "Unnamed". A blank name counts as none. */
export function featureLabel(feature: InspectedFeature, lang: "en" | "fr"): string {
  const named = nameText(feature.properties[`name:${lang}`]) ?? nameText(feature.properties.name);
  if (named !== undefined) return named;
  if (feature.id !== undefined) return `#${feature.id}`;
  return INSPECT_COPY[lang].unnamed;
}

/** A property value as text: strings as they are, objects and arrays as JSON. */
export function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

export interface HighlightData {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: Record<string, never>; geometry: unknown }>;
}

export const NO_HIGHLIGHT: HighlightData = { type: "FeatureCollection", features: [] };

/**
 * Whether `source` takes its feature ids from a property (`promoteId`). Such an id is only as unique
 * as the property, so the outline keeps to the piece hit rather than every feature sharing the value.
 */
function promotesId(map: InspectMap, source: string): boolean {
  const promoted = (spec: unknown) => (spec as { promoteId?: unknown } | undefined)?.promoteId != null;
  return promoted(map.getSource(source)) || promoted(map.getStyle()?.sources?.[source]);
}

/**
 * The outline of `feature`: with an id, every piece of it in the loaded tiles (a road or a park
 * crossing tile edges is found in each), drawn per tile, so the pieces may overlap faintly at tile
 * edges; without one, from a source that promotes a property to the id, or when no piece is
 * loaded, the piece hit.
 */
export function highlightData(map: InspectMap, feature: InspectedFeature | null): HighlightData {
  if (!feature) return NO_HIGHLIGHT;
  const pieces =
    feature.id === undefined || promotesId(map, feature.source)
      ? []
      : map
          .querySourceFeatures(feature.source, {
            ...(feature.sourceLayer ? { sourceLayer: feature.sourceLayer } : {}),
            filter: ["==", ["id"], feature.id],
          })
          .map((piece) => piece.geometry)
          .filter((geometry) => geometry != null);
  const geometries = pieces.length > 0 ? pieces : [feature.geometry];
  return {
    type: "FeatureCollection",
    features: geometries.map((geometry) => ({ type: "Feature", properties: {}, geometry })),
  };
}

type LiveMap = Parameters<typeof accentColor>[0];

const POLYGONS = ["in", ["geometry-type"], ["literal", ["Polygon", "MultiPolygon"]]];
// Polygons get no stroke: their pieces are clipped to tiles, and a stroke would draw every seam.
const LINES = ["in", ["geometry-type"], ["literal", ["LineString", "MultiLineString"]]];
const POINTS = ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]];

/** The outline layers on `sourceId`, bottom first, in `color` or your `--primary`: polygons filled, lines stroked, points ringed. */
export function inspectLayers(live: LiveMap, sourceId: string, color: string | undefined): LayerSpec[] {
  const colour = accentColor(live, color, undefined);
  const metadata = { [HELPER_KEY]: true };
  return [
    {
      id: `${sourceId}-fill`,
      type: "fill",
      source: sourceId,
      filter: POLYGONS,
      metadata,
      paint: { "fill-color": colour, "fill-opacity": 0.2 },
    } as LayerSpec,
    {
      id: `${sourceId}-line`,
      type: "line",
      source: sourceId,
      filter: LINES,
      metadata,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": colour, "line-width": 3 },
    } as LayerSpec,
    {
      id: `${sourceId}-circle`,
      type: "circle",
      source: sourceId,
      filter: POINTS,
      metadata,
      paint: {
        "circle-color": colour,
        "circle-opacity": 0.3,
        "circle-radius": 9,
        "circle-stroke-color": colour,
        "circle-stroke-width": 2,
      },
    } as LayerSpec,
  ];
}
// --- end inspector helpers ---

export interface FeatureInspectorProps {
  /** Map id when multiple maps share a page. Defaults to "default". */
  mapId?: string;
  /** Style layer ids to query. One ending in `*` matches every layer that starts with the rest. Default: every layer but the tools' own. */
  layers?: string[];
  /** "point" (default): the features under a click. "view": everything drawn in the view, again after every move. */
  scope?: "point" | "view";
  /** Most rows listed. Defaults to 50. */
  limit?: number;
  /** Clicks query the map while true. Defaults to true. */
  enabled?: boolean;
  /** Language of the card. Also picks `name:fr` over `name` for row names. Defaults to "en". */
  lang?: "en" | "fr";
  /** Heading. Defaults to "Features". */
  title?: string;
  /** Outline colour. Defaults to your --primary. */
  color?: string;
  /** Called when the selected feature changes; `null` when none is. */
  onSelect?: (feature: InspectedFeature | null) => void;
  className?: string;
}

type Found = { features: InspectedFeature[]; total: number };

export function FeatureInspector({
  mapId,
  layers,
  scope = "point",
  limit = 50,
  enabled = true,
  lang = "en",
  title,
  color,
  onSelect,
  className,
}: FeatureInspectorProps) {
  const sourceId = `unmap-inspector-${useId().replace(/[^a-zA-Z0-9-]/g, "")}`;
  const copy = INSPECT_COPY[lang];
  const [found, setFound] = useState<Found | null>(null);
  const [selected, setSelected] = useState<InspectedFeature | null>(null);
  const [outline, setOutline] = useState<HighlightData>(NO_HIGHLIGHT);

  const { map, ready } = useLayerSet({
    mapId,
    sourceId,
    data: outline,
    beforeId: null,
    key: color ?? "",
    layers: (live) => inspectLayers(live, sourceId, color),
  });

  const latest = useRef({ layers, limit, onSelect, selected });
  latest.current = { layers, limit, onSelect, selected };
  const select = (feature: InspectedFeature | null) => {
    setSelected(feature);
    setOutline(map && feature ? highlightData(map, feature) : NO_HIGHLIGHT);
    latest.current.onSelect?.(feature);
  };
  const selectRef = useRef(select);
  selectRef.current = select;
  const layersKey = JSON.stringify(layers ?? null);

  // Off means gone: no list, no selection, no outline.
  useEffect(() => {
    if (enabled) return;
    setFound(null);
    if (latest.current.selected) selectRef.current(null);
  }, [enabled]);

  useEffect(() => {
    if (!map || !ready || !enabled) return;
    let removed = false;
    const onRemove = () => {
      removed = true;
    };
    const query = (box?: [[number, number], [number, number]]): Found | null => {
      // No style while a swap is under way: nothing to query.
      if (removed || !map.getStyle()) return null;
      const ids = queryLayers(map.getLayersOrder(), latest.current.layers);
      const options = ids ? { layers: ids } : {};
      const rendered = ids && ids.length === 0 ? [] : box ? map.queryRenderedFeatures(box, options) : map.queryRenderedFeatures(options);
      return inspectFeatures(rendered, latest.current.limit);
    };
    const onClick = (event: MapClick) => {
      const { x, y } = event.point;
      const result = query([
        [x - INSPECT_TOLERANCE, y - INSPECT_TOLERANCE],
        [x + INSPECT_TOLERANCE, y + INSPECT_TOLERANCE],
      ]);
      if (!result) return;
      setFound(result);
      selectRef.current(result.features[0] ?? null);
    };
    const onIdle = () => {
      const result = query();
      if (result) setFound((previous) => (JSON.stringify(previous) === JSON.stringify(result) ? previous : result));
    };
    map.on("remove", onRemove);
    if (scope === "view") {
      map.on("idle", onIdle);
      onIdle();
    } else {
      map.on("click", onClick);
    }
    return () => {
      map.off("remove", onRemove);
      map.off("idle", onIdle);
      map.off("click", onClick);
    };
  }, [map, ready, enabled, scope, layersKey]);

  const features = found?.features ?? [];
  const empty = scope === "view" ? copy.emptyView : found ? copy.emptyPoint : copy.hint;
  const heading = title ?? copy.title;

  return (
    <Card className={cn("gap-3", className)} data-unmap-inspector="">
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        {found ? <CardDescription>{copy.count(features.length, found.total)}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {/* shadcn's Table hands a caller's attributes to its table in React but to its scroll
            container in Vue, so each table is named by a region around it, the same in both lanes. */}
        {features.length === 0 ? (
          <p className="text-muted-foreground text-sm">{empty}</p>
        ) : (
          <section aria-label={heading}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.feature}</TableHead>
                  <TableHead>{copy.layer}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {features.map((feature) => {
                  const active = selected?.key === feature.key;
                  return (
                    <TableRow key={feature.key} data-state={active ? "selected" : undefined}>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-pressed={active}
                          onClick={() => select(active ? null : feature)}
                        >
                          {featureLabel(feature, lang)}
                        </Button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{feature.layer}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        )}
        {selected ? (
          <section aria-label={copy.properties}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{copy.property}</TableHead>
                  <TableHead>{copy.value}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* TableCell is whitespace-nowrap: a long name or value must wrap inside the card. */}
                {Object.entries(selected.properties).map(([name, value]) => (
                  <TableRow key={name}>
                    <TableCell className="whitespace-normal wrap-anywhere">{name}</TableCell>
                    <TableCell className="whitespace-normal wrap-anywhere">{formatValue(value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
