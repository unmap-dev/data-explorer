"use client";

import { useId, useRef } from "react";
import { AlertCircleIcon, DatabaseIcon, FileUpIcon, ScanIcon, XIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { Dataset, GeoJsonErrorCode, GeometryKind } from "@/lib/geojson";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { TEXT } from "@/lib/text";

export type Origin = "sample" | "file";
export type LoadError = { code: GeoJsonErrorCode | "read" | "sample-missing" | "sample-failed"; where?: string };

const KINDS: GeometryKind[] = ["point", "line", "polygon"];

/**
 * Where the data comes from: a file the reader opens (read here, sent nowhere) or the sample.
 * A file that does not validate is refused with the reason, and the dataset already open stays.
 */
export function DataSource({
  dataset,
  origin,
  error,
  loadingSample,
  lang,
  onFile,
  onSample,
  onClose,
  onFit,
}: {
  dataset: Dataset | null;
  origin: Origin | null;
  error: LoadError | null;
  loadingSample: boolean;
  lang: Lang;
  onFile: (file: File) => void;
  onSample: () => void;
  onClose: () => void;
  onFit: () => void;
}) {
  const t = TEXT[lang];
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const message = error
    ? error.code === "sample-missing"
      ? t.sampleMissing
      : error.code === "sample-failed"
        ? t.sampleFailed
        : format(t.errors[error.code], { where: error.where ?? "" })
    : null;
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-2" data-source="">
      <h2 id={`${id}-title`} className="text-sm font-medium">
        {t.dataTitle}
      </h2>
      {dataset ? (
        <Card size="sm" data-dataset={origin ?? ""}>
          <CardContent className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{origin === "sample" ? t.sampleBadge : t.fileBadge}</Badge>
              <span className="min-w-0 flex-1 truncate font-medium" title={dataset.name}>
                {origin === "sample" ? t.sampleName : dataset.name}
              </span>
              <Button variant="ghost" size="icon-sm" aria-label={t.closeAria} onClick={onClose}>
                <XIcon />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground tabular-nums" data-summary="">
              {format(t.summary, { n: formatNumber(dataset.features.length, lang) })}
              {KINDS.filter((k) => dataset.kinds[k]).map((k) => ` · ${formatNumber(dataset.kinds[k], lang)} ${t.kinds[k]}`)}
            </p>
            {dataset.skipped ? (
              <p className="text-xs text-muted-foreground">{dataset.skipped === 1 ? t.skippedOne : format(t.skipped, { n: dataset.skipped })}</p>
            ) : null}
            <Button size="sm" variant="outline" className="self-start" onClick={onFit}>
              <ScanIcon />
              {t.fit}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">{t.intro}</p>
      )}
      {/* The browser's own file control reads "Choose File / No file chosen" in the OS language; a
          Button opens it instead, so the section speaks the page's language. */}
      <input
        ref={input}
        id={`${id}-file`}
        type="file"
        accept=".geojson,.json,application/geo+json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-file-input=""
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) onFile(file);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => input.current?.click()}>
          <FileUpIcon />
          {dataset ? t.openAnother : t.open}
        </Button>
        {origin !== "sample" ? (
          <Button size="sm" variant="outline" disabled={loadingSample} onClick={onSample}>
            {loadingSample ? <Spinner /> : <DatabaseIcon />}
            {loadingSample ? t.loadingSample : t.loadSample}
          </Button>
        ) : null}
      </div>
      {message ? (
        <Alert variant="destructive" data-load-error={error!.code}>
          <AlertCircleIcon />
          <AlertDescription>{message}</AlertDescription>
          {error!.code === "sample-failed" ? (
            <AlertAction>
              <Button variant="outline" size="sm" onClick={onSample}>
                {t.retry}
              </Button>
            </AlertAction>
          ) : null}
        </Alert>
      ) : null}
    </section>
  );
}
