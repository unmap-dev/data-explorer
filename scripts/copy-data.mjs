#!/usr/bin/env node
/**
 * Serve the sample dataset as a static file: data/calgary-communities.geojson →
 * public/data/calgary-communities.geojson. The app fetches it when you ask for the sample, so a
 * visitor who opens their own file never downloads it. Runs before `dev` and `build`; the copy is
 * generated and .gitignore'd.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const name = "calgary-communities.geojson";
const source = path.join(process.cwd(), "data", name);
const dest = path.join(process.cwd(), "public", "data", name);

if (existsSync(source)) {
  mkdirSync(path.dirname(dest), { recursive: true });
  copyFileSync(source, dest);
  console.log(`[data] copied data/${name} -> public/data/${name}`);
} else {
  rmSync(dest, { force: true });
  console.log(`[data] data/${name} does not exist: the sample button will say so. Run \`node scripts/fetch-sample.mjs\`.`);
}
