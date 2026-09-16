import { AuthStorage } from "@earendil-works/pi-coding-agent";
import { invalidateModelsCache } from "@/lib/models-cache";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const authStorage = AuthStorage.create();
  const oauthProviders = authStorage.getOAuthProviders();
  if (!oauthProviders.some((p) => p.id === provider)) {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 });
  }
  const cred = authStorage.get(provider);
  if (cred && cred.type !== "oauth") {
    return Response.json({ error: `${provider} is authenticated with an API key, not OAuth` }, { status: 409 });
  }
  if (!cred) {
    invalidateModelsCache();
    return Response.json({ ok: true });
  }
  authStorage.logout(provider);
  invalidateModelsCache();
  return Response.json({ ok: true });
}
