import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * live-sync — bidirectional idle live sync TUI <-> Web (A+B)
 * Watches the active session .jsonl for external appends (prime-web)
 * and notifies TUI while idle. Web already watches via /api/sessions/[id]/watch.
 * For streaming both live, Web should join daemon (A); this plugin covers idle B.
 * Put here: ~/.prime/agent/extensions/live-sync.ts — auto-discovered, keeps prime-agent repo clean for git pull.
 */

export default function (pi: ExtensionAPI) {
  const watchers = new Map<string, { close(): void }>();
  const intervals = new Map<string, ReturnType<typeof setInterval>>();
  const lastSeen = new Map<string, { mtime: number; count: number; leaf: string | null }>();

  function getAgentDir(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = require("@earendil-works/pi-coding-agent") as any;
      return m.getAgentDir?.() ?? (process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.prime/agent`);
    } catch {
      return process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.prime/agent`;
    }
  }

  async function getFileInfo(path: string) {
    try {
      const st = await stat(path);
      return st.mtimeMs;
    } catch { return 0; }
  }

  pi.on("session_start", async (_e, ctx) => {
    const sm: any = (ctx as any).sessionManager;
    const file = sm?.getSessionFile?.() ?? sm?.sessionFile ?? "";
    if (!file) return;
    const id = sm?.getHeader?.()?.id ?? sm?.id ?? file;
    if (watchers.has(id)) return;

    lastSeen.set(id, { mtime: await getFileInfo(file), count: sm?.getEntries?.()?.length ?? 0, leaf: sm?.getLeafId?.() ?? null });

    // fs.watch for immediate push
    try {
      const w = watch(file, async () => {
        if (!(ctx as any).isIdle?.()) return;
        const mtime = await getFileInfo(file);
        const prev = lastSeen.get(id);
        if (prev && mtime === prev.mtime) return;
        // compare leaf/count via fresh open if possible
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
          // extract actual user text from fresh entries to show in TUI (not just count)
          try {
            const entries: any[] = fresh.getEntries();
            const newEntries = entries.slice(prev?.count ?? 0);
            const userTexts = newEntries.filter((e: any) => e.type === "message" && e.message?.role === "user")
              .map((e: any) => {
                const c = e.message.content;
                if (typeof c === "string") return c.slice(0,120);
                if (Array.isArray(c)) return (c.find((b:any)=>b.type==="text")?.text ?? "").slice(0,120);
                return "";
              }).filter(Boolean);
            const preview = userTexts.length ? `: "${userTexts[userTexts.length-1]}"` : "";
            if (freshCount > (prev?.count ?? 0)) {
              ctx.ui.notify(`Web${preview} (+${freshCount - (prev?.count ?? 0)})`, "info");
              ctx.ui.setStatus("live-sync", `↔ ${preview || freshCount+" msgs"}`);
              setTimeout(() => ctx.ui.setStatus("live-sync", undefined), 8000);
            }
          } catch {
            if (freshCount > (prev?.count ?? 0)) {
              ctx.ui.notify(`Web updated: ${freshCount - (prev?.count ?? 0)} new msg(s)`, "info");
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
                const entries: any[] = fresh.getEntries();
                const newEntries = entries.slice(prev.count);
                const userTexts = newEntries.filter((e: any) => e.type === "message" && e.message?.role === "user").map((e: any) => {
                  const c = e.message.content; if (typeof c === "string") return c.slice(0,120); if (Array.isArray(c)) return (c.find((b:any)=>b.type==="text")?.text ?? "").slice(0,120); return "";
                }).filter(Boolean);
                const preview = userTexts.length ? `: "${userTexts[userTexts.length-1]}"` : "";
                ctx.ui.notify(`Web${preview} (+${freshCount - prev.count})`, "info");
              } catch { ctx.ui.notify(`Web sync: +${freshCount - prev.count} msg(s)`, "info"); }
            }
          } else {
            lastSeen.set(id, { mtime, count: freshCount, leaf: freshLeaf });
          }
        } catch {}
      }
    }, 2000) as unknown as ReturnType<typeof setInterval>;
    intervals.set(id, iv);
  });

  pi.on("session_shutdown", async (e, _ctx) => {
    // cleanup per session — e.reason includes quit/reload
    // we don't have id here directly, cleanup all stale watchers if file gone
    for (const [id, w] of watchers) {
      try { (w as any).close?.(); } catch {}
      watchers.delete(id);
    }
    for (const [id, iv] of intervals) {
      try { clearInterval(iv as any); } catch {}
      intervals.delete(id);
    }
    // also clear statuses
  });
}
