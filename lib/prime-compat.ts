// ponytail: prime-agent compat – single source for upstream merges
// Ensures pi-web works with prime-agent 0.9.5 (flat sessions, .prime/agent) while keeping upstream pi-web mergeable.
// All prime-specific env/layout logic should stay here; other files just import ensurePrimeEnv().
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

/**
 * Ensure PI_CODING_AGENT_DIR points to prime when prime is installed.
 * - Inside prime daemon, PRIME_AGENT_CODING_AGENT_DIR is already set -> reuse it
 * - Otherwise if ~/.prime/agent exists -> use it
 * - No-op when PI already set (explicit user override)
 * Idempotent, safe to call from multiple entry points (next.config, rpc-manager, etc)
 */
export function ensurePrimeEnv(): void {
  if (process.env.PI_CODING_AGENT_DIR) return;
  try {
    const primeDir = process.env.PRIME_AGENT_CODING_AGENT_DIR || join(homedir(), ".prime/agent");
    if (existsSync(primeDir)) process.env.PI_CODING_AGENT_DIR = primeDir;
  } catch {}
}

// Auto-run on import so `import "./prime-compat"` is enough (covers ESM/CJS)
ensurePrimeEnv();

/**
 * Dual-layout scanner helper – prime flat sessions/*.jsonl + pi nested sessions/<encoded-cwd>/*.jsonl
 * Upstream pi-web only handles nested; prime 0.9.5 uses flat.
 */
export function isSessionFile(name: string): boolean {
  return name.endsWith(".jsonl");
}
