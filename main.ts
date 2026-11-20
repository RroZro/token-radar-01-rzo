// main.ts — token-radar-01 entry (TypeScript, Node 22, standard library only)
// Reads the sealed snapshot from /input/snapshot.json, scores every pre-token
// protocol with the model in lib/model.ts, writes the ranked board to
// /output/board.json, writes the dashboard data beside the page, copies
// dashboard/ and screenshots/ to /output, and writes /output/dossier.json
// with the vendored make.fun library.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Build metadata:
//   Harness:    Hermes Agent v0.23.1
//   Provider:   nvidia
//   Model:      nemotron-3.5-super-vl-120b-a12b
//   Effort:     default
//   MCP:        none
//   Source repo: token-radar-entry (this directory)
//   Bounty:     token-radar-01 (make.fun)
//   Deadline:   2026-11-24T17:00:00Z

import fs, { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRadar,
  parseSnapshot,
  boardIssue,
  dataScript,
  type Snapshot,
} from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const here = fileURLToPath(new URL(".", import.meta.url));

/** The scorer's own caps (reference/gate.json). */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

const inputArg = arg("input", "/input");
const inputFile = inputArg.endsWith(".json") ? inputArg : path.join(inputArg, "snapshot.json");
if (!fs.existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");

const snapshot: Snapshot = parseSnapshot(fs.readFileSync(inputFile, "utf8"));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "board.json"), `${JSON.stringify({ rows: board })}\n`);
fs.writeFileSync(path.join(out, "data.js"), dataScript(radar));

function copyFiles(from: string, to: string): string[] {
  if (!fs.existsSync(from)) return [];
  fs.mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of fs.readdirSync(from)) {
    if (name.startsWith(".")) continue;
    const p = path.join(from, name);
    if (!fs.statSync(p).isFile()) continue;
    fs.copyFileSync(p, path.join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(path.join(here, "dashboard"), path.join(out, "dashboard"));
const shots = copyFiles(path.join(here, "screenshots"), path.join(out, "screenshots"));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? "" : "s"}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

writeFileSync(
  path.join(out, "dossier.json"),
  buildDossier(out, {
    text_max_bytes: TEXT_MAX_BYTES,
    screenshots: SCREENSHOT_CAPS,
    dashboard: { max_files: 400, max_bytes: 4_194_304 },
  })
);

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.early_size} early, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${path.join(out, "board.json")}, ${path.join(out, "data.js")}, ${path.join(out, "dashboard")} (3 files), ${path.join(out, "screenshots")} (${shots.length} images) and ${path.join(out, "dossier.json")}\n`,
);

