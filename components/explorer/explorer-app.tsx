"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DownloadIcon, ShieldCheckIcon } from "lucide-react";
import { STYLE_NAMES } from "@unmap/maps";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { InspectedFeature } from "@/components/ui/feature-inspector";
import type { LayerLegendValue } from "@/components/ui/layer-legend";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { categorical, colourable, colourScheme, describeAttributes, searchFeatures, withoutValues } from "@/lib/attributes";
import { GeoJsonError, MAX_FILE_BYTES, exportCollection, parseGeoJson, type DataFeature, type Dataset } from "@/lib/geojson";
import { AppHeader } from "@/lib/kit/app-header";
import { API_KEY, BASE_PATH } from "@/lib/kit/config";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { MissingKey } from "@/lib/kit/missing-key";
import { useLang } from "@/lib/kit/use-lang";
import { MANIFEST } from "@/lib/manifest";
import { TEXT } from "@/lib/text";
import { cn } from "@/lib/utils";
import { AttributeTable } from "./attribute-table";
import { DataSource, type LoadError, type Origin } from "./data-source";
import { DATA_LAYER, ExplorerMap } from "./explorer-map";

/** The sample, served from public/data by scripts/copy-data.mjs. */
const SAMPLE_URL = `${BASE_PATH}/data/calgary-communities.geojson`;

/** Quiet under coloured data, which is what `muted` is for. */
const DEFAULT_BASEMAP = "muted";

/** The sentinel the colour Select uses for "one colour". */
const NONE = "__none";

const SAMPLE_ATTRIBUTION = MANIFEST.provenance.find((p) => p.kind === "dataset")?.attribution ?? "";

const capitalise = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/** Saves text as a file, the way a browser saves a download. */
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/geo+json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "communities.geojson" → "communities-filtered.geojson". */
const exportName = (name: string) => `${name.replace(/\.(geo)?json$/i, "") || "data"}-filtered.geojson`;

/** The always-visible promise: a file is read here and sent nowhere. */
function Notice({ lang }: { lang: Lang }) {
  const t = TEXT[lang];
  return (
    <Alert data-notice="">
      <ShieldCheckIcon />
      <AlertTitle>{t.noticeTitle}</AlertTitle>
      <AlertDescription>{t.notice}</AlertDescription>
    </Alert>
  );
}

/**
 * Data Explorer: open a GeoJSON file (or the sample), see it on a live Unmap basemap, search and
 * filter its attributes, colour it by one, read it as a table and export what is left. The file
 * never leaves the browser; the basemap is the only Unmap call.
 */
export function ExplorerApp() {
  const [lang, setLang] = useLang();
  const t = TEXT[lang];
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [error, setError] = useState<LoadError | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);
  const [query, setQuery] = useState("");
  const [colourKey, setColourKey] = useState<string | null>(null);
  const [legend, setLegend] = useState<LayerLegendValue>({});
  const [basemap, setBasemap] = useState(DEFAULT_BASEMAP);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [fit, setFit] = useState<{ key: string; features: readonly DataFeature[] }>({ key: "", features: [] });
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  const open = useCallback((next: Dataset, from: Origin, colour: string | null = null) => {
    setDataset(next);
    setOrigin(from);
    setError(null);
    setQuery("");
    setColourKey(colour);
    setLegend({});
    setSelectedId(null);
    setFit({ key: `${from}:${next.name}:${Date.now()}`, features: next.features });
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_FILE_BYTES) return setError({ code: "too-large" });
      try {
        open(parseGeoJson(await file.text(), file.name), "file");
      } catch (caught) {
        setError(caught instanceof GeoJsonError ? { code: caught.code, where: caught.where } : { code: "read" });
      }
    },
    [open],
  );

  const loadSample = useCallback(async () => {
    setLoadingSample(true);
    setError(null);
    try {
      const response = await fetch(SAMPLE_URL);
      if (response.status === 404) return setError({ code: "sample-missing" });
      if (!response.ok) return setError({ code: "sample-failed" });
      // Coloured by sector from the start, so the sample shows what colouring by an attribute does.
      open(parseGeoJson(await response.text(), "calgary-communities.geojson"), "sample", "sector");
    } catch {
      setError({ code: "sample-failed" });
    } finally {
      setLoadingSample(false);
    }
  }, [open]);

  // The sample opens on a first visit, so the app shows something before a file is chosen.
  // Once, on mount; the language switch must not reload it. Loading is a fetch, an external
  // system, so the spinner it sets first is the subscription's own state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSample();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const features = useMemo(() => dataset?.features ?? [], [dataset]);
  const attributes = useMemo(() => describeAttributes(features), [features]);
  const colourAttribute = attributes.find((a) => a.key === colourKey) ?? null;
  const isCategorical = colourAttribute ? categorical(colourAttribute) : false;
  const scheme = useMemo(
    () => (colourAttribute ? colourScheme(colourAttribute, features, (n) => formatNumber(n, lang, Number.isInteger(n) ? 0 : 2), t.noValue) : null),
    [colourAttribute, features, lang, t.noValue],
  );
  const excluded = useMemo(() => (isCategorical && colourKey ? (legend.excluded?.[DATA_LAYER] ?? []) : []), [isCategorical, colourKey, legend]);
  const visible = useMemo(() => {
    const searched = searchFeatures(features, query);
    return colourKey ? withoutValues(searched, colourKey, excluded) : searched;
  }, [features, query, colourKey, excluded]);
  const selected = visible.find((f) => f.id === selectedId) ?? null;
  const filtered = visible.length !== features.length;

  const pick = (feature: DataFeature) => {
    setSelectedId(feature.id);
    setFit({ key: `feature:${feature.id}:${Date.now()}`, features: [feature] });
  };
  // A click on the map selects through the inspector; its generated id is the feature's index in
  // the collection the map was given, which is `visible`.
  const inspect = (feature: InspectedFeature | null) => {
    const hit = feature && feature.source === DATA_LAYER && typeof feature.id === "number" ? visible[feature.id] : null;
    setSelectedId(hit ? hit.id : null);
  };

  const colourOptions = [{ value: NONE, label: t.singleColour }, ...attributes.filter(colourable).map((a) => ({ value: a.key, label: a.key }))];
  const basemaps = STYLE_NAMES.map((name) => ({ value: name, label: capitalise(name) }));

  return (
    <div
      className="relative flex h-dvh flex-col"
      onDragEnter={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void openFile(file);
      }}
    >
      <AppHeader manifest={MANIFEST} lang={lang} onLang={setLang} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="order-last flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t p-3 lg:order-first lg:w-[440px] lg:flex-none lg:border-t-0 lg:border-r">
          <Notice lang={lang} />
          <DataSource
            dataset={dataset}
            origin={origin}
            error={error}
            loadingSample={loadingSample}
            lang={lang}
            onFile={(file) => void openFile(file)}
            onSample={() => void loadSample()}
            onClose={() => {
              setDataset(null);
              setOrigin(null);
              setSelectedId(null);
              setColourKey(null);
            }}
            onFit={() => setFit({ key: `fit:${Date.now()}`, features })}
          />
          {dataset ? (
            <>
              <Separator />
              <section aria-labelledby="filter-title" className="flex flex-col gap-3">
                <h2 id="filter-title" className="text-sm font-medium">
                  {t.filterTitle}
                </h2>
                <Field>
                  <FieldLabel htmlFor="search">{t.search}</FieldLabel>
                  <Input id="search" type="search" value={query} placeholder={t.searchPlaceholder} onChange={(e) => setQuery(e.currentTarget.value)} />
                </Field>
                <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite" data-feature-count="">
                  {filtered
                    ? format(t.countOf, { n: formatNumber(visible.length, lang), total: formatNumber(features.length, lang) })
                    : format(t.count, { n: formatNumber(features.length, lang) })}
                </p>
                {filtered ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={() => {
                      setQuery("");
                      setLegend({});
                    }}
                  >
                    {t.clearFilters}
                  </Button>
                ) : null}
              </section>
              <Separator />
              <section aria-labelledby="colour-title" className="flex flex-col gap-3">
                <h2 id="colour-title" className="text-sm font-medium">
                  {t.colourTitle}
                </h2>
                <Field>
                  <FieldLabel htmlFor="colour-by">{t.colourBy}</FieldLabel>
                  <Select
                    items={colourOptions}
                    value={colourKey ?? NONE}
                    onValueChange={(value) => {
                      setColourKey(value === NONE || value === null ? null : String(value));
                      setLegend({});
                    }}
                  >
                    <SelectTrigger id="colour-by" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {colourOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <FieldDescription>{t.colourNote}</FieldDescription>
                </Field>
                {scheme && !isCategorical ? (
                  <ul aria-label={t.valuesTitle} className="flex flex-col gap-1 text-xs" data-numeric-legend="">
                    {scheme.legend.map((entry) => (
                      <li key={entry.label} className="flex items-center gap-2 tabular-nums">
                        <span aria-hidden className="size-3 shrink-0 rounded-sm border" style={{ background: entry.colour }} />
                        {entry.label}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Field>
                  <FieldLabel htmlFor="basemap">{t.basemap}</FieldLabel>
                  <Select items={basemaps} value={basemap} onValueChange={(value) => value && setBasemap(String(value))}>
                    <SelectTrigger id="basemap" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {basemaps.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              </section>
              <Separator />
              <section aria-labelledby="table-title" className="flex flex-col gap-3">
                <h2 id="table-title" className="text-sm font-medium">
                  {t.tableTitle}
                </h2>
                {visible.length ? (
                  <AttributeTable features={visible} attributes={attributes} selectedId={selectedId} onSelect={pick} lang={lang} />
                ) : (
                  <Empty className="border">
                    <EmptyHeader>
                      <EmptyDescription>{t.noneMatch}</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                <div className="flex flex-col gap-1">
                  <Button size="sm" variant="outline" className="self-start" disabled={!visible.length} onClick={() => download(exportCollection(visible), exportName(dataset.name))}>
                    <DownloadIcon />
                    {t.export}
                  </Button>
                  <p className="text-xs text-muted-foreground">{visible.length === 1 ? t.exportNoteOne : format(t.exportNote, { n: formatNumber(visible.length, lang) })}</p>
                </div>
              </section>
              {origin === "sample" ? (
                <p className="text-xs text-muted-foreground" data-attribution="">
                  {format(t.attribution, { attribution: SAMPLE_ATTRIBUTION })}
                </p>
              ) : null}
            </>
          ) : (
            <Empty className="border">
              <EmptyHeader>
                <EmptyDescription>
                  <span className="block font-medium text-foreground">{t.emptyTitle}</span>
                  {t.emptyBody}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent />
            </Empty>
          )}
        </aside>
        <main className="h-[45dvh] shrink-0 lg:h-auto lg:min-w-0 lg:flex-1">
          {API_KEY ? (
            <ExplorerMap
              features={visible}
              selected={selected}
              scheme={scheme}
              colourKey={colourKey}
              legend={legend}
              onLegend={setLegend}
              categorical={isCategorical}
              basemap={basemap}
              fitKey={fit.key}
              fitTo={fit.features}
              onInspect={inspect}
              lang={lang}
            />
          ) : (
            <MissingKey lang={lang} />
          )}
        </main>
      </div>
      {dragging ? (
        <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-background/80 text-lg font-medium")}>
          <span className="rounded-xl border-2 border-dashed border-primary px-8 py-6">{t.dropHint}</span>
        </div>
      ) : null}
    </div>
  );
}
