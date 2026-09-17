#!/usr/bin/env node
// Toggle prime-agent wiring between dev symlink (external checkout) and publish (submodule + registry deps)
// Usage: node scripts/prime-agent-toggle.js --dev    -> use ../2026-08-13-primeagent (or $PRIME_AGENT_DEV_PATH)
//        node scripts/prime-agent-toggle.js --publish -> use ./prime-agent submodule + ^0.9.5 registry deps for npm publish
//        node scripts/prime-agent-toggle.js --restore -> restore submodule file:./prime-agent for local dev without symlink
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const devPath = process.env.PRIME_AGENT_DEV_PATH || '../2026-08-13-primeagent';
const mode = process.argv[2];

const fileDeps = {
  "@earendil-works/pi-agent-core": "file:./prime-agent/packages/agent",
  "@earendil-works/pi-ai": "file:./prime-agent/packages/ai",
  "@earendil-works/pi-coding-agent": "file:./prime-agent/packages/coding-agent",
  "@earendil-works/pi-tui": "file:./prime-agent/packages/tui",
};
const devFileDeps = {
  "@earendil-works/pi-agent-core": `file:${devPath}/packages/agent`,
  "@earendil-works/pi-ai": `file:${devPath}/packages/ai`,
  "@earendil-works/pi-coding-agent": `file:${devPath}/packages/coding-agent`,
  "@earendil-works/pi-tui": `file:${devPath}/packages/tui`,
};
const registryDeps = {
  "@earendil-works/pi-agent-core": "^0.9.5",
  "@earendil-works/pi-ai": "^0.9.5",
  "@earendil-works/pi-coding-agent": "^0.9.5",
  "@earendil-works/pi-tui": "^0.9.5",
};

function patch(deps) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies = { ...pkg.dependencies, ...deps };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`patched package.json -> ${JSON.stringify(deps)}`);
}

if (mode === '--dev') {
  // Keep submodule gitlink intact; point deps to external checkout via file: path (no symlink needed, avoids git status error)
  // If user insists on symlink, they can still ln -s externally but we warn
  patch(devFileDeps);
  console.log(`dev: using ${devPath} (set PRIME_AGENT_DEV_PATH to override)`);
  console.log('run: npm install');
} else if (mode === '--publish') {
  // For npm publish: registry deps so bun add github: and npm install from registry work; submodule stays for .next build reference if needed
  patch(registryDeps);
  console.log('publish: using registry ^0.9.5 deps (file: would break npm consumers)');
  console.log('run: npm install && npm run build && npm publish --access public');
} else if (mode === '--restore' || mode === '--submodule') {
  patch(fileDeps);
  console.log('restored: file:./prime-agent submodule deps');
  console.log('run: git submodule update --init --depth 1 && cd prime-agent && npm install && npm run build && cd .. && npm install');
} else {
  console.log('Usage: node scripts/prime-agent-toggle.js --dev | --publish | --restore');
  process.exit(1);
}
