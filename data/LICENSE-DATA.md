# Licence of the sample data

This licence covers **`data/calgary-communities.geojson` only**. The app's code is MIT (see the
README); the two are separate.

`data/calgary-communities.geojson` is derived from **The City of Calgary, Community District
Boundaries**, published on Open Calgary:
<https://data.calgary.ca/Base-Maps/Community-District-Boundaries/surr-xmvs>

It is used under the **Open Government Licence – City of Calgary** (version 2.1 when fetched):
<https://data.calgary.ca/d/Open-Data-Terms/u45n-7awa>. The full, authoritative text is at that
address; read it there.

In short (not a substitute for the text):

- You may copy, modify, publish, translate, adapt, distribute or otherwise use the information, in
  any medium, for any lawful purpose, commercial or not.
- You must acknowledge the source with the attribution statement below and, where possible, link
  to the licence.
- The licence grants no right to use the City's names, crests or logos, and does not suggest that
  the City endorses you or your use.
- The information is provided as is, without warranty, and the City is not liable for errors or
  omissions.

## Attribution

> Contains information licensed under the Open Government Licence – City of Calgary.

The app shows this line under the panel whenever the sample is open.

## What was changed

`scripts/fetch-sample.mjs` keeps six of the published attributes (`name`, `comm_code`, `sector`,
`class`, `srg`, `comm_structure`), drops the record dates, rounds coordinates to five decimals and
sorts the districts by name. Nothing else is changed.
