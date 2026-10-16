# Data Explorer, built with Unmap

Open a GeoJSON file in the browser and work with it on a live Unmap basemap: see its points, lines
and polygons, search and filter its attributes, colour it by one, read it as a table, inspect what
is under a click, and export what you kept as GeoJSON. One of the
[Unmap apps](https://unmap.dev/apps); live at
[apps.unmap.dev/data-explorer](https://apps.unmap.dev/data-explorer/).

**Your file stays in your browser.** It is read on the page and sent nowhere; the basemap is the
only thing that comes from Unmap. The app opens on a real sample, the City of Calgary's community
district boundaries (open data, see [`DATA_SOURCES.md`](DATA_SOURCES.md)), so there is something
to look at before you choose a file.

## Run it

You need Node 24 (22.18+ works), pnpm and a free Unmap browser key from
[unmap.dev/dashboard](https://unmap.dev/dashboard).

```bash
cp .env.example .env.local      # then set NEXT_PUBLIC_UNMAP_KEY
pnpm install
pnpm dev                        # http://localhost:3207
```

Without a key the app still reads and validates your file and lists its attributes; it shows how
to get a key where the map would be, and never calls the API with a missing key.

| Command | |
| --- | --- |
| `pnpm dev` | development server on port 3207 |
| `pnpm build` | static export in `out/` |
| `pnpm test` | unit tests (Vitest) |
| `pnpm lint` / `pnpm typecheck` | |
| `pnpm fetch-sample` | refresh `data/calgary-communities.geojson` from the City of Calgary |
| `pnpm run deploy` | build, then `wrangler deploy` to your Cloudflare account (edit `wrangler.jsonc` first) |

The key ships in the browser bundle. Restrict it to your origins (`http://localhost:3207` and your
domain) in the dashboard. Any static host works: `out/` is plain files.

## What a file has to be

GeoJSON as [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946) defines it: a FeatureCollection, a
Feature or a bare geometry, in longitude and latitude on WGS 84, up to 25 MB. A
GeometryCollection is split into one feature per member, keeping its attributes. Features with no
geometry are left out and counted.

A file is refused, with the reason, when it is not JSON, is TopoJSON, is JSON but not GeoJSON,
names a `crs` other than WGS 84, has projected coordinates (metres rather than degrees, the most
common mistake: reproject with `ogr2ogr -t_srs EPSG:4326`), has a position out of range, or has a
broken shape (a one-point line, a ring that does not close). The rules are in `lib/geojson.ts`.

Bigger or private data belongs on a server: Unmap's hosted overlays take files up to 5 MB, and
anything larger is better served as vector tiles. This app deliberately does neither: a public demo
must not upload a visitor's file with a shared key.

## Use your own sample

Replace `data/calgary-communities.geojson` with any valid GeoJSON, update `SAMPLE_URL` and the
first colour attribute in `components/explorer/explorer-app.tsx`, and change the `dataset` entry
in `lib/manifest.ts`, `DATA_SOURCES.md` and `data/LICENSE-DATA.md` to your data and its licence.

## How it is built

```
app/page.tsx                   the one page; renders the app in the browser
components/explorer/           the app: data panel, filters, colour, table, export, map pane
components/ui/  lib/map-*      Unmap registry components and shadcn primitives, copied in unmodified
lib/kit/                       the Unmap app kit (header, Built with Unmap panel, en/fr), copied in
lib/geojson.ts                 reading and validating a file (no React)
lib/attributes.ts              attribute types, search, value filters, colour schemes (no React)
lib/manifest.ts                what the Built with Unmap panel lists
lib/text.ts                    this app's words in English and French
scripts/fetch-sample.mjs       fetches data/calgary-communities.geojson (no dependencies)
```

Layers run one way: components → `lib/` (plain TypeScript, unit-tested) → the registry's `map`,
the only thing that talks to the API. The map pieces are Unmap registry components; install the
same ones in your own project with
`npx @unmap/cli add map geojson-layer layer-legend feature-inspector map-controls`.

In the Unmap monorepo the copied files are kept in step by `pnpm sync` and `test/sync.test.ts`; in
your own copy they are ordinary source you can edit.

## Licence

Code: MIT. Sample data: Open Government Licence – City of Calgary, see
[`data/LICENSE-DATA.md`](data/LICENSE-DATA.md). Map data © OpenStreetMap contributors (ODbL),
served by Unmap.
