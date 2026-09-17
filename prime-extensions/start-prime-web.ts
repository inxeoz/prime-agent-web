import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * /start-prime-web — launch prime-web from prime-agent TUI (A+B live sync)
 * Puts prime-web control inside TUI instead of manual npm run start.
 * Auto-discovered at ~/.prime/agent/extensions/start-prime-web.ts
 */

const WEB_DIR = "/home/inxeoz/Work/tries/2026-09-08-pi-web-to-prime-agent-web";
const WEB_PORT = 30141;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

function isWebRunning(): boolean {
  try {
    execSync(`lsof -i :${WEB_PORT} -sTCP:LISTEN -t`, { stdio: "ignore" });
    return true;
  } catch { return false; }
}

function hasBuild(): boolean {
  return existsSync(join(WEB_DIR, ".next", "BUILD_ID"));
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("start-prime-web", {
    description: "Start prime-web (Next.js) for TUI<->Web live sync (A+B). Usage: /start-prime-web [--build] [--port 30141]",
    getArgumentCompletions: (prefix: string) => {
      const opts = ["--build", "--port ", "--cwd "];
      return opts.filter(o => o.startsWith(prefix)).map(v => ({ value: v, label: v }));
    },
    handler: async (args, ctx) => {
      const wantBuild = args.includes("--build");
      const portArg = args.match(/--port\s+(\d+)/)?.[1];
      const port = portArg ? Number(portArg) : WEB_PORT;

      if (isWebRunning()) {
        ctx.ui.notify(`prime-web already running at ${WEB_URL}`, "info");
        return;
      }

      ctx.ui.notify(`Starting prime-web at ${WEB_URL}...`, "info");
      ctx.ui.setStatus("prime-web", "starting...");

      try {
        if (wantBuild || !hasBuild()) {
          ctx.ui.setStatus("prime-web", "building...");
          await new Promise<void>((resolve, reject) => {
            const p = spawn("npm", ["run", "build"], { cwd: WEB_DIR, stdio: "ignore", detached: false });
            p.on("error", reject);
            p.on("close", code => code === 0 ? resolve() : reject(new Error(`build exit ${code}`)));
          });
        }

        // spawn detached so TUI stays responsive; log to /tmp
        const log = "/tmp/prime-web.log";
        const child = spawn("bash", ["-c", `nohup npm run start > ${log} 2>&1 & echo $!`], {
          cwd: WEB_DIR,
          stdio: "ignore",
          detached: true,
        });
        child.unref();

        // wait for port
        for (let i = 0; i < 15; i++) {
          await new Promise(r => setTimeout(r, 800));
          if (isWebRunning()) {
            ctx.ui.notify(`prime-web ready at ${WEB_URL} (log ${log})`, "info");
            ctx.ui.setStatus("prime-web", `● ${WEB_URL}`);
            setTimeout(() => ctx.ui.setStatus("prime-web", undefined), 10000);
            return;
          }
        }
        ctx.ui.notify(`prime-web start timeout — check ${log}`, "warning");
        ctx.ui.setStatus("prime-web", "timeout");
      } catch (e) {
        ctx.ui.notify(`start-prime-web failed: ${e instanceof Error ? e.message : String(e)}`, "error");
        ctx.ui.setStatus("prime-web", "error");
      } finally {
        setTimeout(() => ctx.ui.setStatus("prime-web", undefined), 10000);
      }
    },
  });

  pi.registerCommand("kill-prime-web", {
    description: "Kill prime-web (force)",
    handler: async (_args, ctx) => {
      try {
        execSync(`lsof -ti :${WEB_PORT} | xargs -r kill -9`, { stdio: "ignore" });
        // also cleanup npm wrapper
        try { execSync(`pkill -f "next start.*${WEB_PORT}"`, { stdio: "ignore" }); } catch {}
        ctx.ui.notify("prime-web killed", "info");
      } catch {
        ctx.ui.notify("prime-web not running", "info");
      }
    },
  });

  pi.registerCommand("stop-prime-web", {
    description: "Stop prime-web",
    handler: async (_args, ctx) => {
      try {
        execSync(`lsof -ti :${WEB_PORT} | xargs -r kill`, { stdio: "ignore" });
        ctx.ui.notify("prime-web stopped", "info");
      } catch {
        ctx.ui.notify("prime-web not running", "info");
      }
    },
  });
}
