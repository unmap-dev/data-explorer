# Features

What Data Explorer does, which Unmap API does it, and what it deliberately does not do (spec §9).

## Implemented

| Feature | How | Unmap |
| --- | --- | --- |
| Basemap | registry `map`, any of the fourteen styles (Muted by default, made for data on top), light or dark with the page, labels in English or French | Maps API (`/styles`, `/tiles`) |
| Open a file | a button or a drop anywhere on the page; read in the browser with `File.text()`, never uploaded | — |
| Validate it | RFC 7946 GeoJSON in WGS 84, up to 25 MB; refused with the reason (en/fr) when it is not JSON, TopoJSON, not GeoJSON, a non-WGS 84 `crs`, projected coordinates, out of range, or a broken shape; features without geometry left out and counted; the open dataset stays when a new file is refused | — |
| Points, lines and polygons | registry `geojson-layer`: fills with outlines, lines, circles, each filtered to its geometry type, hover highlight | — |
| Fit to data | on opening, and on demand | — |
| Attribute table | registry-free, the shadcn `Table`: one row per feature that passes the filters, one column per attribute, first 200 rows (the selected feature always listed); a row frames and outlines its feature on the map | — |
| Click to inspect | registry `feature-inspector`: everything under a click, topmost selected and outlined, its attributes listed; the table follows | — |
| Search | every attribute value, case and accents ignored | — |
| Colour by an attribute | a text attribute with up to 12 values (a fixed categorical palette) or a number (five quantile classes on a sequential ramp); "No value" in grey | — |
| Filter by value | registry `layer-legend` for the coloured attribute: a checkbox per value; the table, the count and the export follow the map | — |
| Export | the features that pass the filters as plain RFC 7946 GeoJSON, with their attributes, as a download | — |
| Sample | the City of Calgary's community districts (real open data), opened on a first visit and coloured by sector | — |
| Privacy notice | always visible: a file is read on the page and sent nowhere | — |
| English and French | the header switch; map labels follow | Maps `lang` |
| No-key state | the file is still read and listed; the map pane explains how to get a key; the API is never called without one | — |
| Built with Unmap | the services, calls, components and data sources behind the page | — |

The basemap is the app's only Unmap traffic. Search, filters, colouring and export run on the
features already in the page.

## Not goals

Reprojection, formats other than GeoJSON (Shapefile, KML, GeoPackage, CSV), hosted upload, spatial
queries, editing geometry, and saving a session (spec §9). Hosted overlays (BYOD) belong in an
authenticated example of their own, not a public demo with a shared key.
