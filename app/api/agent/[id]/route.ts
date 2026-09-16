import { NextResponse } from "next/server";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { resolveSessionPath } from "@/lib/session-reader";
import { startRpcSession, getRpcSession, setRpcSessionTools } from "@/lib/rpc-manager";

const execFile = promisify(execFileCb);

async function isDaemonSessionLive(id: string): Promise<boolean> {
  try {
    const { stdout } = await execFile("prime-agent", ["list", "--json"], { timeout: 3000 });
    const data = JSON.parse(stdout) as { sessions?: Array<{ sessionId?: string; id?: string; activeSessionId?: string }> };
    const sessions = data.sessions ?? [];
    return sessions.some((s) => s.sessionId === id || s.id === id || s.activeSessionId === id);
  } catch { return false; }
}

async function forwardToDaemon(id: string, body: Record<string, unknown>): Promise<unknown> {
  if (body.type !== "prompt") return null;
  const message = typeof body.message === "string" ? body.message : "";
  if (!message.trim()) throw new Error("prompt message is empty");
  const behavior = typeof body.streamingBehavior === "string" ? body.streamingBehavior : undefined;
  const args = ["send", id, message];
  if (behavior === "steer") args.splice(2, 0, "--steer");
  else if (behavior === "followUp" || behavior === "follow_up") args.splice(2, 0, "--follow-up");
  const { stdout } = await execFile("prime-agent", args, { timeout: 15000 });
  try { return JSON.parse(stdout); } catch { return { output: stdout }; }
}

// POST /api/agent/[id] - Send a command to an existing session
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let commandType: string | undefined;
  let promptAccepted = false;

  try {
    const body = await req.json() as { type: string; [key: string]: unknown };
    commandType = typeof body.type === "string" ? body.type : undefined;
    const requestedToolNames = body.toolNames;
    if (
      requestedToolNames !== undefined
      && (!Array.isArray(requestedToolNames) || requestedToolNames.some((name) => typeof name !== "string"))
    ) {
      throw new Error("toolNames must be an array of strings");
    }
    const toolNames = requestedToolNames as string[] | undefined;

    // A+B: if daemon owns this session (TUI open), forward prompt to daemon for true both-live
    if (body.type === "prompt") {
      try {
        if (await isDaemonSessionLive(id)) {
          const daemonResult = await forwardToDaemon(id, body as Record<string, unknown>);
          promptAccepted = true;
          return NextResponse.json({ success: true, data: daemonResult });
        }
      } catch (e) {
        // daemon forward failed, fall through to local wrapper
        console.warn("[pi-web] daemon forward failed, falling back to local:", e);
      }
    }

    // Fast path: already-running session
    const existing = getRpcSession(id);
    if (body.type === "set_tools") {
      const filePath = existing?.sessionFile || await resolveSessionPath(id) || undefined;
      if (!existing?.isAlive() && !filePath) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      const changed = await setRpcSessionTools(id, filePath, toolNames);
      return NextResponse.json({
        success: true,
        data: { sessionId: changed.sessionId, recreated: changed.recreated },
      });
    }
    if (existing?.isAlive()) {
      const result = await existing.send(body);
      promptAccepted = body.type === "prompt";
      return NextResponse.json({ success: true, data: result });
    }

    const filePath = await resolveSessionPath(id);
    if (!filePath) {
      return NextResponse.json({
        error: "Session not found",
        ...(body.type === "prompt"
          ? { code: "prompt_rejected", accepted: false }
          : {}),
      }, { status: 404 });
    }

    const { session } = await startRpcSession(id, filePath, undefined, {
      ...(toolNames !== undefined ? { toolNames } : {}),
    });
    const result = await session.send(body);
    promptAccepted = body.type === "prompt";

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
      ...(commandType === "prompt" && !promptAccepted
        ? { code: "prompt_rejected", accepted: false }
        : {}),
    }, { status: 500 });
  }
}

// GET /api/agent/[id] - Get current agent state
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const session = getRpcSession(id);
    if (!session || !session.isAlive()) {
      return NextResponse.json({ running: false });
    }

    const state = await session.send({ type: "get_state" });
    return NextResponse.json({ running: true, state });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
