import { watch } from "fs";
import { resolveSessionPath } from "@/lib/session-reader";

export const dynamic = "force-dynamic";

// GET /api/sessions/[id]/watch - SSE for external .jsonl changes (pi TUI)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (req.signal.aborted) return new Response(null, { status: 204 });
  const filePath = await resolveSessionPath(id);
  if (!filePath) return new Response("Session not found", { status: 404 });

  let closed = false;
  let watcher: ReturnType<typeof watch> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      const safeEnqueue = (s: string) => {
        if (closed) return;
        try { controller.enqueue(enc.encode(s)); } catch { closed = true; }
      };
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        try { watcher?.close(); } catch {}
        try { controller.close(); } catch {}
      };
      // fs.watch is the cheapest; poll fallback if watch fails (network FS)
      try {
        watcher = watch(filePath, () => safeEnqueue(`data: ${JSON.stringify({ type: "changed" })}\n\n`));
        watcher.on("error", () => {});
      } catch {
        // fall back to mtime polling at 1.5s inside SSE
        let lastMtime = 0;
        const poll = async () => {
          try {
            const { stat } = await import("fs/promises");
            const st = await stat(filePath);
            if (st.mtimeMs !== lastMtime) {
              lastMtime = st.mtimeMs;
              safeEnqueue(`data: ${JSON.stringify({ type: "changed" })}\n\n`);
            }
          } catch {}
        };
        const iv = setInterval(() => void poll(), 1500);
        // tie cleanup to stream close
        watcher = { close: () => clearInterval(iv) } as unknown as ReturnType<typeof watch>;
      }

      heartbeat = setInterval(() => safeEnqueue(":\n\n"), 30000);
      safeEnqueue(":\n\n");
      req.signal.addEventListener("abort", cleanup, { once: true });
    },
    cancel() {
      closed = true;
      try { watcher?.close(); } catch {}
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
