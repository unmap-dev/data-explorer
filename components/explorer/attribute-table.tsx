"use client";

import { useEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayValue, type Attribute } from "@/lib/attributes";
import type { DataFeature } from "@/lib/geojson";
import { format, formatNumber, type Lang } from "@/lib/kit/i18n";
import { TEXT } from "@/lib/text";
import { cn } from "@/lib/utils";

/** Rows rendered at once. The filters narrow the rest; a table of thousands is not a way to read. */
export const TABLE_ROWS = 200;

/**
 * The features that pass the filters, one row each, one column per attribute. A row is a button
 * for the map: choosing it outlines the feature and moves the camera to it. The chosen row is
 * scrolled into view when the choice comes from the map instead.
 */
export function AttributeTable({
  features,
  attributes,
  selectedId,
  onSelect,
  lang,
}: {
  features: readonly DataFeature[];
  attributes: readonly Attribute[];
  selectedId: number | null;
  onSelect: (feature: DataFeature) => void;
  lang: Lang;
}) {
  const t = TEXT[lang];
  // A feature chosen on the map may be past the first rows: it is listed first, so the table always
  // shows what the map has selected.
  const first = features.slice(0, TABLE_ROWS);
  const chosen = selectedId === null || first.some((f) => f.id === selectedId) ? null : (features.find((f) => f.id === selectedId) ?? null);
  const rows = chosen ? [chosen, ...first] : first;
  const selectedRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    selectedRow.current?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);
  if (!attributes.length) return <p className="text-xs text-muted-foreground">{t.noAttributes}</p>;
  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-80 overflow-auto rounded-lg border" data-attribute-table="">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead className="w-12 text-right">#</TableHead>
              {attributes.map((a) => (
                <TableHead key={a.key} className={cn(a.kind === "number" && "text-right")}>
                  {a.key}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((f) => {
              const selected = f.id === selectedId;
              return (
                <TableRow
                  key={f.id}
                  ref={selected ? selectedRow : undefined}
                  data-state={selected ? "selected" : undefined}
                  data-feature-row={f.id}
                  tabIndex={0}
                  aria-label={format(t.selectRow, { n: f.id + 1 })}
                  aria-selected={selected}
                  className="cursor-pointer"
                  onClick={() => onSelect(f)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    onSelect(f);
                  }}
                >
                  <TableCell className="text-right text-muted-foreground tabular-nums">{f.id + 1}</TableCell>
                  {attributes.map((a) => {
                    const value = f.properties[a.key];
                    return (
                      <TableCell key={a.key} className={cn("max-w-48 truncate", a.kind === "number" && "text-right tabular-nums")} title={displayValue(value)}>
                        {typeof value === "number" ? formatNumber(value, lang, Number.isInteger(value) ? 0 : 2) : displayValue(value)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {features.length > TABLE_ROWS ? (
        <p className="text-xs text-muted-foreground">{format(t.tableNote, { n: TABLE_ROWS, total: formatNumber(features.length, lang) })}</p>
      ) : null}
    </div>
  );
}
