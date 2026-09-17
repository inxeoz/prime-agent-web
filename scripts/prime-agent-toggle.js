#!/usr/bin/env node
// Submodule-only: package.json always uses file:./prime-agent (no symlink, no registry toggle)
// Usage: node scripts/prime-agent-toggle.js --restore  (default) -> ensures file:./prime-agent
//        npm run dev:restore -> git submodule update --init --depth 1 && npm install
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const mode = process.argv[2];

const fileDeps = {
  "@earendil-works/pi-agent-core": "file:./prime-agent/packages/agent",
  "@earendil-works/pi-ai": "file:./prime-agent/packages/ai",
  "@earendil-works/pi-coding-agent": "file:./prime-agent/packages/coding-agent",
  "@earendil-works/pi-tui": "file:./prime-agent/packages/tui",
};

function patch(deps) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = { ...pkg.dependencies, ...deps };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`patched package.json -> ${JSON.stringify(deps)}`);
}

if (!mode || mode === '--restore' || mode === '--submodule') {
  patch(fileDeps);
  console.log('restored: file:./prime-agent submodule deps');
  console.log('run: npm run dev:restore  # git submodule update --init --depth 1 && npm install');
} else if (mode === '--publish' || mode === '--dev') {
  console.error(`removed: ${mode} deleted. Submodule ./prime-agent is the only source (no symlink, no registry).`);
  console.error('run: npm run dev:restore');
  process.exit(1);
} else {
  console.log('Usage: node scripts/prime-agent-toggle.js --restore');
  process.exit(1);
}
