import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";
import type { ProviderListingInput } from "@/lib/provider-listing";

/**
 * Adapter between `AuthStorage`/`ModelRegistry` and the pure listing helpers in
 * `lib/provider-listing.ts`.
 */
export async function collectProviderListingInputs(): Promise<ProviderListingInput[]> {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  const allModels = modelRegistry.getAll();

  const oauthProviders = authStorage.getOAuthProviders();
  const oauthIds = new Set(oauthProviders.map((p) => p.id));
  const oauthById = new Map(oauthProviders.map((p) => [p.id, p] as const));

  const modelProviderIds = new Set(allModels.map((m) => m.provider));
  const allProviderIds = new Set<string>([...modelProviderIds, ...oauthIds]);

  const result: ProviderListingInput[] = [];
  for (const id of allProviderIds) {
    const oauth = oauthById.get(id);
    const hasOAuth = oauthIds.has(id);
    const hasApiKeyLogin = true;
    const status = modelRegistry.getProviderAuthStatus(id);
    const cred = authStorage.get(id);
    const credentialType = cred?.type === "api_key" || cred?.type === "oauth" ? cred.type : undefined;
    const modelCount = allModels.filter((m) => m.provider === id).length;
    const displayName = modelRegistry.getProviderDisplayName(id);

    result.push({
      id,
      name: displayName,
      hasApiKeyLogin,
      hasOAuth,
      ...(oauth?.name ? { oauthName: oauth.name } : {}),
      status,
      ...(credentialType ? { credentialType } : {}),
      modelCount,
    });
  }

  return result;
}
