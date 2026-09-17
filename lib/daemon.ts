import { DaemonClient, defaultDaemonSocketPath } from "@earendil-works/pi-coding-agent";

type GlobalWithDaemon = typeof globalThis & {
  __piDaemonClient?: DaemonClient;
  __piDaemonConnectPromise?: Promise<DaemonClient> | null;
  __piDaemonListCache?: { at: number; ids: Set<string> } | null;
};

const g = globalThis as GlobalWithDaemon;
const LIST_TTL_MS = 2000;

function getSocketPath(): string {
  return defaultDaemonSocketPath();
}

async function getClient(): Promise<DaemonClient> {
  if (g.__piDaemonClient?.isConnected) return g.__piDaemonClient;
  if (g.__piDaemonConnectPromise) return g.__piDaemonConnectPromise;
  g.__piDaemonConnectPromise = (async () => {
    const c = new DaemonClient(getSocketPath());
    try {
      await c.connect(1000);
      g.__piDaemonClient = c;
      c.onClose(() => {
        if (g.__piDaemonClient === c) g.__piDaemonClient = undefined;
      });
      return c;
    } catch (e) {
      try { c.close(); } catch {}
      throw e;
    } finally {
      g.__piDaemonConnectPromise = null;
    }
  })();
  return g.__piDaemonConnectPromise;
}

export async function isDaemonSessionLive(id: string): Promise<boolean> {
  try {
    const c = await getClient();
    const now = Date.now();
    let ids: Set<string>;
    const cached = g.__piDaemonListCache;
    if (cached && now - cached.at < LIST_TTL_MS) {
      ids = cached.ids;
    } else {
      const res = await c.request({ type: "list" }, 3000);
      if (!res.success) return false;
      const data = res.data as unknown as { sessions?: Array<{ activeSessionId?: string; sessionId?: string; id?: string }> };
      const sessions: Array<{ activeSessionId?: string; sessionId?: string; id?: string }> =
        Array.isArray(data) ? (data as unknown as Array<{ activeSessionId?: string }>) : (data.sessions ?? []);
      ids = new Set(sessions.flatMap((s) => [s.activeSessionId, s.sessionId, s.id].filter(Boolean) as string[]));
      g.__piDaemonListCache = { at: now, ids };
    }
    if (ids.has(id)) return true;
    for (const sid of Array.from(ids)) if (sid.endsWith(id) || id.endsWith(sid)) return true;
    return false;
  } catch {
    return false;
  }
}

export async function forwardToDaemon(id: string, body: Record<string, unknown>): Promise<unknown> {
  const c = await getClient();
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) throw new Error("prompt message is empty");
  const behavior = typeof body.streamingBehavior === "string" ? body.streamingBehavior : undefined;
  const type = behavior === "steer" ? "steer" : behavior === "followUp" || behavior === "follow_up" ? "follow_up" : "prompt";
  const res = await c.request({ type, activeSessionId: id, message } as unknown as Parameters<typeof c.request>[0], 15000);
  if (!res.success) throw new Error((res as unknown as { error?: string }).error ?? "daemon prompt failed");
  // invalidate list cache after successful prompt (session may have appeared)
  g.__piDaemonListCache = null;
  return (res as unknown as { data?: unknown }).data;
}

// for tests: reset singleton
export function __resetDaemonClientForTests(): void {
  try { g.__piDaemonClient?.close(); } catch {}
  g.__piDaemonClient = undefined;
  g.__piDaemonConnectPromise = null;
  g.__piDaemonListCache = null;
}
