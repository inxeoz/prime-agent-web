import { spawn, execSync } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * prime-web — TUI <-> Web live sync (A+B)
 * - Watches active session .jsonl for external appends (prime-web) and notifies TUI while idle
 * - Provides /start-prime-web, /stop-prime-web, /kill-prime-web to control prime-web from TUI
 * Auto-discovered at ~/.pi/agent/extensions/prime-web.ts — keep prime-agent repo clean for git pull.
 */

const WEB_DIR = "/home/inxeoz/Work/tries/2026-09-08-pi-web-to-prime-agent-web";
const WEB_PORT = 30141;
function isWebRunning(port: number = WEB_PORT): boolean {
  try {
    execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function hasBuild(): boolean {
  return existsSync(join(WEB_DIR, ".next", "BUILD_ID"));
}

export default function (pi: ExtensionAPI) {
  // --- live-sync state ---
  const watchers = new Map<string, { close(): void }>();
  const intervals = new Map<string, ReturnType<typeof setInterval>>();
  const lastSeen = new Map<string, { mtime: number; count: number; leaf: string | null }>();

  async function getFileInfo(path: string) {
    try {
      const st = await stat(path);
      return st.mtimeMs;
    } catch {
      return 0;
    }
  }

  function extractPreview(entries: any[], from: number): string {
    const userTexts = entries
      .slice(from)
      .filter((e: any) => e.type === "message" && e.message?.role === "user")
      .map((e: any) => {
        const c = e.message.content;
        if (typeof c === "string") return c.slice(0, 120);
        if (Array.isArray(c)) return (c.find((b: any) => b.type === "text")?.text ?? "").slice(0, 120);
        return "";
      })
      .filter(Boolean);
    return userTexts.length ? `: "${userTexts[userTexts.length - 1]}"` : "";
  }

  pi.on("session_start", async (_e, ctx) => {
    const sm: any = (ctx as any).sessionManager;
    const file = sm?.getSessionFile?.() ?? sm?.sessionFile ?? "";
    if (!file) return;
    const id = sm?.getHeader?.()?.id ?? sm?.id ?? file;
    if (watchers.has(id)) return;

    lastSeen.set(id, {
      mtime: await getFileInfo(file),
      count: sm?.getEntries?.()?.length ?? 0,
      leaf: sm?.getLeafId?.() ?? null,
    });

    // fs.watch for immediate push
    try {
      const w = watch(file, async () => {
        if (!(ctx as any).isIdle?.()) return;
        const mtime = await getFileInfo(file);
        const prev = lastSeen.get(id);
        if (prev && mtime === prev.mtime) return;
        try {
          const mod: any = await import("@earendil-works/pi-coding-agent");
          const fresh = mod.SessionManager.open(file);
          const freshLeaf = fresh.getLeafId();
          const freshCount = fresh.getEntries().length;
          if (prev && freshLeaf === prev.leaf && freshCount === prev.count) {
            lastSeen.set(id, { mtime, count: freshCount, leaf: freshLeaf });
            return;
          }
          lastSeen.set(id, { mtime, count: freshCount, leaf: freshLeaf });
          if (prev && freshCount > prev.count) {
            try {
              const preview = extractPreview(fresh.getEntries(), prev.count);
              ctx.ui.notify(`Web${preview} (+${freshCount - prev.count})`, "info");
              ctx.ui.setStatus("live-sync", `↔ ${preview || freshCount + " msgs"}`);
              setTimeout(() => ctx.ui.setStatus("live-sync", undefined), 8000);
            } catch {
              ctx.ui.notify(`Web updated: ${freshCount - prev.count} new msg(s)`, "info");
            }
          }
        } catch {
          ctx.ui.notify("Web changed session file (external write detected)", "info");
        }
      });
      w.on("error", () => {});
      watchers.set(id, w as any);
    } catch {}

    // fallback poll every 2s while idle (covers network FS where watch fails)
    const iv = (ctx as any).setInterval(async () => {
      if (!(ctx as any).isIdle?.()) return;
      const mtime = await getFileInfo(file);
      const prev = lastSeen.get(id);
      if (!prev || mtime !== prev.mtime) {
        try {
          const mod: any = await import("@earendil-works/pi-coding-agent");
          const fresh = mod.SessionManager.open(file);
          const freshLeaf = fresh.getLeafId();
          const freshCount = fresh.getEntries().length;
          if (freshLeaf !== prev?.leaf || freshCount !== prev?.count) {
            lastSeen.set(id, { mtime, count: freshCount, leaf: freshLeaf });
            if (prev && freshCount > prev.count) {
              try {
                const preview = extractPreview(fresh.getEntries(), prev.count);
                ctx.ui.notify(`Web${preview} (+${freshCount - prev.count})`, "info");
              } catch {
                ctx.ui.notify(`Web sync: +${freshCount - prev.count} msg(s)`, "info");
              }
            }
          } else {
            lastSeen.set(id, { mtime, count: freshCount, leaf: freshLeaf });
          }
        } catch {}
      }
    }, 2000) as unknown as ReturnType<typeof setInterval>;
    intervals.set(id, iv);
  });

  pi.on("session_shutdown", async () => {
    for (const [, w] of watchers) {
      try {
        (w as any).close?.();
      } catch {}
    }
    watchers.clear();
    for (const [, iv] of intervals) {
      try {
        clearInterval(iv as any);
      } catch {}
    }
    intervals.clear();
    lastSeen.clear();
  });

  // --- prime-web commands ---
  pi.registerCommand("start-prime-web", {
    description:
      "Start prime-web (Next.js) for TUI<->Web live sync (A+B). Usage: /start-prime-web [--build] [--port 30141]",
    getArgumentCompletions: (prefix: string) => {
      const opts = ["--build", "--port ", "--cwd "];
      return opts.filter((o) => o.startsWith(prefix)).map((v) => ({ value: v, label: v }));
    },
    handler: async (args, ctx) => {
      const wantBuild = args.includes("--build");
      const portArg = args.match(/--port\s+(\d+)/)?.[1];
      const port = portArg ? Number(portArg) : WEB_PORT;
      const url = `http://127.0.0.1:${port}`;

      if (isWebRunning(port)) {
        let pid = "";
        try {
          pid = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim().split(/\s+/)[0] ?? "";
        } catch {}
        ctx.ui.notify(`prime-web already running at ${url}${pid ? ` (pid ${pid})` : ""}`, "info");
        return;
      }

      ctx.ui.notify(`Starting prime-web at ${url}...`, "info");
      ctx.ui.setStatus("prime-web", "starting...");

      try {
        if (wantBuild || !hasBuild()) {
          ctx.ui.setStatus("prime-web", "building...");
          await new Promise<void>((resolve, reject) => {
            const p = spawn("npm", ["run", "build"], { cwd: WEB_DIR, stdio: "ignore", detached: false });
            p.on("error", reject);
            p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`build exit ${code}`))));
          });
        }

        const log = "/tmp/prime-web.log";
        const child = spawn("bash", ["-c", `nohup npm run start > ${log} 2>&1 & echo $!`], {
          cwd: WEB_DIR,
          stdio: "ignore",
          detached: true,
        });
        child.unref();

        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 800));
          if (isWebRunning(port)) {
            let pid = "";
            try {
              pid = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim().split(/\s+/)[0] ?? "";
            } catch {}
            ctx.ui.notify(`prime-web ready at ${url} (pid ${pid || "?"} log ${log})`, "info");
            ctx.ui.setStatus("prime-web", `● ${url}`);
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
        execSync(`lsof -ti :${WEB_PORT} -sTCP:LISTEN | xargs -r kill -9`, { stdio: "ignore" });
        try {
          execSync(`pkill -f "next start.*${WEB_PORT}"`, { stdio: "ignore" });
        } catch {}
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
        execSync(`lsof -ti :${WEB_PORT} -sTCP:LISTEN | xargs -r kill`, { stdio: "ignore" });
        ctx.ui.notify("prime-web stopped", "info");
      } catch {
        ctx.ui.notify("prime-web not running", "info");
      }
    },
  });
}
