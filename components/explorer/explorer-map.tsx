"use client";

import { useEffect, useMemo } from "react";
import { FeatureInspector, type InspectedFeature } from "@/components/ui/feature-inspector";
import { GeoJSONLayer } from "@/components/ui/geojson-layer";
import { LayerLegend, type LayerLegendValue } from "@/components/ui/layer-legend";
import { Map } from "@/components/ui/map";
import { MapControls } from "@/components/ui/map-controls";
import type { ColourScheme } from "@/lib/attributes";
import { boundsOf, toCollection, type DataFeature } from "@/lib/geojson";
import { API_KEY, GATEWAY } from "@/lib/kit/config";
import type { Lang } from "@/lib/kit/i18n";
import { useMap, useMapReady } from "@/lib/map-context";
import { TEXT } from "@/lib/text";

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The data layer's id: its style layers are `data-fill`, `data-line` and `data-circle`. */
export const DATA_LAYER = "data";

/** Canada, before any data is loaded. */
const START: [number, number] = [-96, 56];

/** Fits the view to some features whenever `fitKey` changes, never on every render. */
function Camera({ features, fitKey }: { features: readonly DataFeature[]; fitKey: string }) {
  const map = useMap();
  // A fit asked for before the style has loaded is lost: the sample arrives that fast.
  const ready = useMapReady();
  useEffect(() => {
    const bounds = boundsOf(features);
    if (!map || !ready || !bounds || !fitKey) return;
    const [w, s, e, n] = bounds;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: 48, maxZoom: 15, duration: reduceMotion() ? 0 : 600 },
    );
    // Only a new fit request moves the camera; filtering in place must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ready, fitKey]);
  return null;
}

export interface ExplorerMapProps {
  /** The features that pass the filters, drawn on the map. */
  features: readonly DataFeature[];
  /** The feature picked in the table, outlined over the rest. */
  selected: DataFeature | null;
  /** How features are coloured, or null for one colour. */
  scheme: ColourScheme | null;
  /** The attribute coloured by, which the legend names. */
  colourKey: string | null;
  /** Categories switched off in the legend (controlled, so the table and export follow). */
  legend: LayerLegendValue;
  onLegend: (value: LayerLegendValue) => void;
  /** Whether the legend can switch values off: a text attribute with few values. */
  categorical: boolean;
  basemap: string;
  /** Changes when the camera should fit: a new dataset, "Fit to data", a feature from the table. */
  fitKey: string;
  fitTo: readonly DataFeature[];
  onInspect: (feature: InspectedFeature | null) => void;
  lang: Lang;
}

/**
 * The live map: the reader's data drawn with the GeoJSON layer item, coloured by an attribute when
 * one is chosen, a legend for the colours, and the feature inspector answering clicks with the
 * attributes of what is under the pointer.
 */
export function ExplorerMap({ features, selected, scheme, colourKey, legend, onLegend, categorical, basemap, fitKey, fitTo, onInspect, lang }: ExplorerMapProps) {
  const t = TEXT[lang];
  const data = useMemo(() => toCollection(features), [features]);
  const picked = useMemo(() => toCollection(selected ? [selected] : []), [selected]);
  const colour = scheme?.expression;
  // The legend item switches categories off on the map; the app reads the same value to filter the
  // table and the export, so all three agree. A numeric scale is listed in the panel instead.
  const legendItems = useMemo(
    () =>
      scheme && colourKey && categorical
        ? [
            {
              id: DATA_LAYER,
              label: colourKey,
              layers: [`${DATA_LAYER}-*`],
              color: false as const,
              filter: {
                property: colourKey,
                values: scheme.legend.filter((entry) => entry.value).map((entry) => ({ value: entry.value!, label: entry.label, color: entry.colour })),
              },
            },
          ]
        : [],
    [scheme, colourKey, categorical],
  );
  return (
    <div role="region" aria-label={t.mapLabel} className="relative h-full min-h-0">
      <Map apiKey={API_KEY} gateway={GATEWAY} style={basemap} lang={lang} center={START} zoom={3} controls={false} className="rounded-none" containerStyle={{ position: "absolute", inset: 0, minHeight: 0 }}>
        <Camera features={fitTo} fitKey={fitKey} />
        <MapControls position="bottom-right" />
        <GeoJSONLayer
          id={DATA_LAYER}
          data={data}
          interactive
          fillPaint={colour ? { "fill-color": colour, "fill-opacity": 0.55 } : { "fill-opacity": 0.35 }}
          linePaint={colour ? { "line-color": colour } : undefined}
          circlePaint={colour ? { "circle-color": colour } : undefined}
        />
        <GeoJSONLayer id="picked" data={picked} fillPaint={{ "fill-opacity": 0.15 }} linePaint={{ "line-width": 4 }} circlePaint={{ "circle-radius": 9 }} />
        <FeatureInspector layers={[`${DATA_LAYER}-*`]} lang={lang} title={t.inspector} onSelect={onInspect} className="absolute top-3 right-3 z-[6] max-h-[60%] w-72 overflow-auto max-lg:hidden" />
        {legendItems.length ? (
          <LayerLegend items={legendItems} value={legend} onValueChange={onLegend} title={t.valuesTitle} className="absolute bottom-3 left-3 z-[6] max-h-[45%] w-60 overflow-auto rounded-lg border bg-popover p-3 text-popover-foreground shadow-md" />
        ) : null}
      </Map>
    </div>
  );
}
