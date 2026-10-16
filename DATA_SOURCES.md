# Data sources

Everything on screen, where it comes from, and how far to trust it.

| What | Source | Licence | Live? |
| --- | --- | --- | --- |
| The sample: Calgary community district boundaries, with their name, code, sector, class, development stage (`srg`) and structure | **The City of Calgary**, *Community District Boundaries*, on [Open Calgary](https://data.calgary.ca/Base-Maps/Community-District-Boundaries/surr-xmvs), fetched into `data/calgary-communities.geojson` by `scripts/fetch-sample.mjs` | Open Government Licence – City of Calgary | No: a snapshot |
| Any file you open | your own file, read in your browser | yours | Not sent anywhere |
| Basemap | Unmap Maps API: OpenStreetMap | ODbL, © OpenStreetMap contributors | Live |

Nothing on screen is invented. The sample is the city's own data; the automated tests build their
small inputs in code and the app never loads them.

## The sample

**The City of Calgary, Community District Boundaries** (`surr-xmvs` on Open Calgary): the boundaries
of Calgary's 313 community districts, residential communities, industrial areas, major parks and
residual sub-areas, each with the city's published classes.

Attribution, as the licence asks and as it is shown in the app under the panel:

> Contains information licensed under the Open Government Licence – City of Calgary.

The licence is the [Open Government Licence – City of Calgary](https://data.calgary.ca/d/Open-Data-Terms/u45n-7awa)
(version 2.1 when fetched), named in the dataset's own record. It allows copying, modifying and
redistributing the information, commercially or not, with that attribution. The full terms and
what was changed are in [`data/LICENSE-DATA.md`](data/LICENSE-DATA.md), separate from the MIT
licence of the code.

### How the file is made

`scripts/fetch-sample.mjs` downloads the dataset as GeoJSON from Open Calgary's API, keeps six
published attributes (`name`, `comm_code`, `sector`, `class`, `srg`, `comm_structure`), rounds
coordinates to five decimals (about a metre), sorts the districts by name, and writes the file.
Shapes, names and classes are otherwise as published.
