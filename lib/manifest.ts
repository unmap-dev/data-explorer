import type { AppManifest } from "@/lib/kit/provenance";

/**
 * What the "Built with Unmap" panel and the header say about Data Explorer. Lists only what the
 * app really calls; a service is added here in the same change that starts calling it.
 */
export const MANIFEST: AppManifest = {
  slug: "data-explorer",
  name: { en: "Data Explorer", fr: "Explorateur de données" },
  tagline: {
    en: "Open a GeoJSON file, filter it, colour it by an attribute and export what you keep, on a live Unmap basemap.",
    fr: "Ouvrez un fichier GeoJSON, filtrez-le, colorez-le selon un attribut et exportez ce que vous gardez, sur une carte de base Unmap en direct.",
  },
  services: [
    {
      name: "Maps",
      role: {
        en: "The basemap under your data: any of the fourteen styles, in light or dark, labels in the page's language. Your file is drawn over it in the browser and never uploaded.",
        fr: "La carte de base sous vos données : l'un des quatorze styles, en clair ou en sombre, étiquettes dans la langue de la page. Votre fichier est dessiné par-dessus dans le navigateur et n'est jamais téléversé.",
      },
      calls: ['<Map apiKey={key} style={style} lang={lang} />', "<GeoJSONLayer data={features} fillPaint={{ \"fill-color\": byAttribute }} />"],
      docs: "https://unmap.dev/docs/apis/maps",
    },
  ],
  items: ["map", "geojson-layer", "layer-legend", "feature-inspector", "map-controls"],
  provenance: [
    {
      kind: "dataset",
      label: {
        en: "The sample: Calgary's community district boundaries and their published classes",
        fr: "L'exemple : les limites des districts communautaires de Calgary et leurs catégories publiées",
      },
      source: "City of Calgary, Community District Boundaries (data.calgary.ca), fetched by scripts/fetch-sample.mjs",
      licence: "Open Government Licence – City of Calgary",
      attribution: "Contains information licensed under the Open Government Licence – City of Calgary.",
      url: "https://data.calgary.ca/Base-Maps/Community-District-Boundaries/surr-xmvs",
    },
    {
      kind: "live",
      label: { en: "Basemap", fr: "Carte de base" },
      source: "Unmap",
      attribution: "© unmap © OpenStreetMap contributors",
    },
  ],
  source: "https://github.com/unmap-dev/data-explorer",
};
