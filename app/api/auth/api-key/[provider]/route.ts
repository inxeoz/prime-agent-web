import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { NextResponse } from "next/server";
import { invalidateModelsCache } from "@/lib/models-cache";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ provider: string }> };

// POST /api/auth/api-key/[provider]  body: { apiKey: string }
export async function POST(req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const { apiKey } = await req.json() as { apiKey?: string };
    if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }
    const authStorage = AuthStorage.create();
    authStorage.set(provider, { type: "api_key", key: apiKey.trim() });
    invalidateModelsCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

// DELETE /api/auth/api-key/[provider] — removes stored API key
export async function DELETE(_req: Request, { params }: Params) {
  const { provider } = await params;
  try {
    const authStorage = AuthStorage.create();
    const cred = authStorage.get(provider);
    if (!cred) {
      invalidateModelsCache();
      return NextResponse.json({ success: true });
    }
    if (cred.type !== "api_key") {
      return NextResponse.json(
        { error: `${provider} is authenticated with OAuth, not an API key` },
        { status: 409 },
      );
    }
    authStorage.remove(provider);
    invalidateModelsCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
