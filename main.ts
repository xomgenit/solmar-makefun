// SOLMAR's entry program (Node 22, standard library only): hands the game in
// by copying game/ and screenshots/ beside this file into the output folder
// and writing the dossier the judge reads, with make.fun's vendored library.
// The grader runs it twice in a sandbox with no network; both runs must
// produce the same bytes. Locally, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  if (!existsSync(from)) return 0;
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  return readdirSync(from).length;
}

mkdirSync(outDir, { recursive: true });
const gameEntries = copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
const shotEntries = copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (gameEntries === 0) throw new Error('game/ is missing or empty — nothing to hand in');
if (shotEntries === 0) throw new Error('screenshots/ is missing or empty — the judge needs renders');

// The scorer's own caps, so a local run refuses what the gate would refuse:
// 4 screenshots at most, 256 KiB each; game/ at most 993 entries / 48 MiB;
// dossier text capped at 160 KiB.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`handed in: ${gameEntries} game entries, ${shotEntries} screenshots`);
