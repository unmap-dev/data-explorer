"use client";

/**
 * <LayerLegend> - a checkbox per row that switches style layers on and off, on your shadcn Field
 * and Checkbox.
 *
 * Each row names the style layers it controls. An id ending in `*` matches every layer whose id
 * starts with the rest: `overlay_energy.wells_*` catches the circle and label layers the gateway
 * adds for that overlay, and `stations-*` every layer a `<GeoJSONLayer id="stations">` draws. A
 * row with a `filter` gets a checkbox per value of a feature property; unchecking one hides the
 * features that carry it, on top of the layer's own filter.
 *
 * The legend owns the visibility of the layers it names: a checked row makes them visible. State
 * is uncontrolled (`defaultValue`) or controlled (`value` + `onValueChange`), shaped
 * `{ hidden: rowIds, excluded: { rowId: values } }`. It is applied again after a style swap and
 * whenever a layer is added, so a layer an overlay adds later, or adds again, picks it up. Ids
 * the style does not have are skipped. Its clause sits next to a time slider's on the same layer;
 * neither undoes the other.
 *
 * A layer belongs to one row across every legend on the map: in one legend the first row that
 * names it decides, and the first legend to apply to a layer (usually the first mounted) owns its
 * visibility and its filter until it unmounts or its rows stop naming the layer. Meanwhile another
 * legend's checkboxes for it change nothing; that legend takes over on its next pass and puts its
 * own clause on the layer's own filter, in place of the old owner's.
 * A row that loses its `filter` gives its layers their own filter back, and an unchecked value
 * the row no longer lists is dropped; removing a row entirely leaves its layers as they were.
 * Unmounting leaves the map as it is; pass `value` to keep checkboxes in step across remounts.
 *
 * Copied into your project by `npx shadcn add`. Edit freely.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { useMap, useMapGeneration, useMapReady } from "@/lib/map-context";
import { composeFilter, isExpressionFilter, matchLayers, setLayerClause } from "@/lib/map-layers";
import { cn } from "@/lib/utils";

// --- legend helpers (kept identical across both lanes) ---

export { isExpressionFilter, matchLayers };

/** One value of the property a row filters on. */
export interface LayerLegendFilterValue {
  /** Compared with `===` against each feature's property. */
  value: string | number;
  label: string;
  /** Swatch colour for this value. None when absent. */
  color?: string;
}

/** A checkbox per value of `property`. Unchecking one hides the features that carry it. */
export interface LayerLegendFilter {
  property: string;
  values: LayerLegendFilterValue[];
}

/** One row of the legend. */
export interface LayerLegendItem {
  /** Stable id: the key in `LayerLegendValue`. */
  id: string;
  label: string;
  /** Style layer ids. One ending in `*` matches every layer whose id starts with the rest. */
  layers: string[];
  /** Swatch colour. Absent: the first matched layer's paint colour, when it is a plain colour. `false`: none. */
  color?: string | false;
  filter?: LayerLegendFilter;
}

/** What the reader switched off: rows by id, and per row the filter values unchecked. */
export interface LayerLegendValue {
  hidden?: string[];
  excluded?: Record<string, Array<string | number>>;
}

/** The part of a MapLibre map the legend drives. */
export interface LegendMap {
  getStyle(): { layers?: Array<{ id: string; type: string; paint?: unknown }> } | undefined;
  getLayoutProperty(id: string, name: string): unknown;
  setLayoutProperty(id: string, name: string, value: unknown): unknown;
  getFilter(id: string): unknown;
  setFilter(id: string, filter: unknown): unknown;
}

/**
 * What every legend on one map shares: per layer id, the legend that owns its visibility. The
 * clauses they write live in map-layers' per-map clause store, which a time slider on the same
 * layer writes to as well, so neither undoes the other.
 */
export interface LegendMemory {
  visibility: Map<string, string>;
}

/**
 * The writer name every legend's clause is held under. One name for all of them: only a layer's
 * visibility owner writes its clause, so a legend that takes a layer over replaces the clause the
 * old owner wrote instead of adding a second one.
 */
const LEGEND_CLAUSE = "layer-legend";

const MEMORY = new WeakMap<object, LegendMemory>();
let legends = 0;

/** A new id for one mounted legend: the name its visibility claims are held under. */
export function legendOwner(): string {
  legends += 1;
  return `legend-${legends}`;
}

/**
 * The memory of `map`, shared by every legend on it. It outlives a legend, so one that unmounts
 * with a Popover or a Tab and mounts again finds its layers where it left them; a map that is
 * created again is a new key and starts empty.
 */
export function legendMemory(map: object): LegendMemory {
  let memory = MEMORY.get(map);
  if (!memory) {
    memory = { visibility: new Map() };
    MEMORY.set(map, memory);
  }
  return memory;
}

/** Give up the visibility of every layer `owner` holds, so the next legend to apply takes it. */
export function releaseLegend(memory: LegendMemory, owner: string): void {
  for (const [id, holder] of memory.visibility) {
    if (holder === owner) memory.visibility.delete(id);
  }
}

const PAINT_COLOUR: Record<string, string> = {
  background: "background-color",
  circle: "circle-color",
  fill: "fill-color",
  "fill-extrusion": "fill-extrusion-color",
  line: "line-color",
  symbol: "text-color",
};

/** The clause that hides the features whose `property` is one of `excluded`, in either syntax. */
function exclusionClause(expression: boolean, property: string, excluded: Array<string | number>): unknown {
  return expression ? ["!", ["in", ["get", property], ["literal", excluded]]] : ["!in", property, ...excluded];
}

/** `base` narrowed to features whose `property` is none of `excluded`; `base` itself when none are. */
export function excludeFilter(base: unknown, property: string, excluded: Array<string | number>): unknown {
  if (excluded.length === 0) return base ?? null;
  return composeFilter(base, [exclusionClause(base == null || isExpressionFilter(base), property, excluded)]);
}

/** `value` with row `id` shown or hidden. */
export function toggleHidden(value: LayerLegendValue, id: string, visible: boolean): LayerLegendValue {
  const hidden = (value.hidden ?? []).filter((entry) => entry !== id);
  return { ...value, hidden: visible ? hidden : [...hidden, id] };
}

/** `value` with one filter value of row `id` shown or hidden. */
export function toggleExcluded(
  value: LayerLegendValue,
  id: string,
  entry: string | number,
  visible: boolean,
): LayerLegendValue {
  const excluded = (value.excluded?.[id] ?? []).filter((candidate) => candidate !== entry);
  return { ...value, excluded: { ...value.excluded, [id]: visible ? excluded : [...excluded, entry] } };
}

/**
 * Apply `value`, as the legend `owner`, to every layer the rows name that the style has now:
 * visibility per row, and each row's unchecked values as a clause on the layer's filter, next to
 * any other writer's (a time slider). It writes only what differs, so running it on every
 * `styledata` event cannot feed itself. A layer belongs to one row across every legend on the map,
 * or two rows would undo each other on every pass (and in MapLibre every write is another pass):
 * in one legend the first row that names it decides. Across legends (`memory`, which every legend
 * on the map shares) the first legend to apply to a layer owns its visibility, and is its only
 * clause writer, until it is released or its rows stop naming the layer; another legend then takes
 * over on its next pass and its clause replaces the old owner's. A row with no `filter` takes the
 * legend clause off, and an unchecked value the row no longer lists is dropped. Returns the swatch
 * colour read from the style for each row that did not set one.
 */
export function applyLegend(
  map: LegendMap,
  items: LayerLegendItem[],
  value: LayerLegendValue,
  memory: LegendMemory,
  owner: string,
): Record<string, string> {
  const layers = map.getStyle()?.layers ?? [];
  const ids = layers.map((layer) => layer.id);
  const patterns = items.flatMap((item) => item.layers);
  for (const [id, holder] of memory.visibility) {
    if (holder === owner && matchLayers([id], patterns).length === 0) memory.visibility.delete(id);
  }
  const claimed = new Set<string>();
  const colours: Record<string, string> = {};
  for (const item of items) {
    const matched = matchLayers(ids, item.layers);
    const visibility = (value.hidden ?? []).includes(item.id) ? "none" : "visible";
    const filter = item.filter;
    // A value the row no longer lists has no checkbox to bring its features back, so it is dropped.
    const listed = filter ? filter.values.map((entry) => entry.value) : [];
    const excluded = (value.excluded?.[item.id] ?? []).filter((entry) => listed.includes(entry));
    const clause =
      filter && excluded.length > 0 ? (expression: boolean) => exclusionClause(expression, filter.property, excluded) : null;
    for (const id of matched) {
      if (claimed.has(id)) continue;
      claimed.add(id);
      // Another legend owns this layer: its visibility and its clause are that legend's to write.
      const holder = memory.visibility.get(id);
      if (holder !== undefined && holder !== owner) continue;
      memory.visibility.set(id, owner);
      if ((map.getLayoutProperty(id, "visibility") ?? "visible") !== visibility) {
        map.setLayoutProperty(id, "visibility", visibility);
      }
      // The store treats any filter it did not write as the layer's own (a new style, or an
      // overlay that added its layer again), so the clause always lands on the current base.
      setLayerClause(map, id, LEGEND_CLAUSE, clause);
    }
    const first = layers.find((layer) => layer.id === matched[0]);
    const key = first ? PAINT_COLOUR[first.type] : undefined;
    const paint = first && key ? (first.paint as Record<string, unknown> | undefined)?.[key] : undefined;
    if (item.color === undefined && typeof paint === "string" && !paint.includes("var(")) colours[item.id] = paint;
  }
  return colours;
}
// --- end legend helpers ---

export interface LayerLegendProps {
  /** The rows, top first. */
  items: LayerLegendItem[];
  /** Map id when multiple maps share a page. Defaults to `"default"`. */
  mapId?: string;
  /** Heading over the rows. */
  title?: string;
  /** Controlled state. Pair with `onValueChange`. */
  value?: LayerLegendValue;
  /** Starting state when uncontrolled. */
  defaultValue?: LayerLegendValue;
  /** Called with the next state on every checkbox change. */
  onValueChange?: (value: LayerLegendValue) => void;
  className?: string;
}

function Swatch({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      data-unmap-legend-swatch=""
      className="size-3 shrink-0 rounded-sm border"
      style={{ backgroundColor: colour }}
    />
  );
}

export function LayerLegend({ items, mapId, title, value, defaultValue, onValueChange, className }: LayerLegendProps) {
  const map = useMap(mapId);
  const ready = useMapReady(mapId);
  const generation = useMapGeneration(mapId);
  const uid = useId();
  const [owner] = useState(legendOwner);
  const [own, setOwn] = useState<LayerLegendValue>(() => defaultValue ?? {});
  const state = value ?? own;
  const [swatches, setSwatches] = useState<Record<string, string>>({});
  const latest = useRef({ items, state });
  latest.current = { items, state };
  const sync = useRef(() => {});

  // Every `styledata` (a style loaded, a layer added or changed) applies the state again. Before a
  // style has loaded `getStyle()` is undefined and nothing is touched.
  useEffect(() => {
    if (!map) return;
    let removed = false;
    const onRemove = () => {
      removed = true;
    };
    const run = () => {
      if (removed || !map.getStyle()) return;
      const colours = applyLegend(map, latest.current.items, latest.current.state, legendMemory(map), owner);
      setSwatches((previous) => (JSON.stringify(previous) === JSON.stringify(colours) ? previous : colours));
    };
    sync.current = run;
    map.on("remove", onRemove);
    map.on("styledata", run);
    return () => {
      sync.current = () => {};
      map.off("remove", onRemove);
      map.off("styledata", run);
      // Another legend naming these layers takes their visibility on its next pass.
      releaseLegend(legendMemory(map), owner);
    };
  }, [map, owner]);

  // Inline `items` and `value` are compared by content, so a parent re-render is not a change.
  const itemsKey = JSON.stringify(items);
  const stateKey = JSON.stringify(state);
  useEffect(() => {
    if (ready) sync.current();
  }, [map, ready, generation, itemsKey, stateKey]);

  const change = (next: LayerLegendValue) => {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  };

  return (
    <FieldSet className={cn("gap-3", className)} data-unmap-legend="">
      {title ? <FieldLegend variant="label">{title}</FieldLegend> : null}
      <FieldGroup className="gap-2">
        {items.map((item) => {
          const rowId = `${uid}-${item.id}`;
          const swatch = item.color === false ? undefined : (item.color ?? swatches[item.id]);
          return (
            <div key={item.id} className="flex flex-col gap-2" data-unmap-legend-row={item.id}>
              <Field orientation="horizontal">
                <Checkbox
                  id={rowId}
                  checked={!(state.hidden ?? []).includes(item.id)}
                  onCheckedChange={(checked: boolean) => change(toggleHidden(state, item.id, checked))}
                />
                <FieldLabel htmlFor={rowId}>
                  {swatch ? <Swatch colour={swatch} /> : null}
                  {item.label}
                </FieldLabel>
              </Field>
              {item.filter ? (
                <FieldGroup className="gap-2 pl-6" role="group" aria-label={item.label}>
                  {item.filter.values.map((entry, index) => {
                    const valueId = `${rowId}-${index}`;
                    return (
                      <Field key={String(entry.value)} orientation="horizontal">
                        <Checkbox
                          id={valueId}
                          checked={!(state.excluded?.[item.id] ?? []).includes(entry.value)}
                          onCheckedChange={(checked: boolean) =>
                            change(toggleExcluded(state, item.id, entry.value, checked))
                          }
                        />
                        <FieldLabel htmlFor={valueId}>
                          {entry.color ? <Swatch colour={entry.color} /> : null}
                          {entry.label}
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </FieldGroup>
              ) : null}
            </div>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
}
