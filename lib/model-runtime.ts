import {
  createAgentSessionServices,
  getAgentDir,
  type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";

/**
 * The subset of pi's `ModelRuntime` surface that the models panel needs,
 * implemented over the vendored fork's `ModelRegistry`.
 *
 * The vendored prime-agent SDK exposes `modelRegistry`, not `modelRuntime`, and
 * it has no remote catalog overlay of its own: built-in models are bundled and
 * Prime Inference's catalog is refreshed by `refreshAvailableModels()`. This
 * facade keeps the enabledModels and catalog-refresh code talking to one shape
 * while staying honest about what the vendored SDK can actually do.
 */
export interface ModelRuntimeCompat {
  getAvailable(): Model<Api>[];
  getAll(): Model<Api>[];
  getError(): string | undefined;
  getProviders(): { id: string; name: string }[];
  getRegisteredProviderIds(): string[];
  /** Network pass over provider catalogs (respects PI_OFFLINE), plus local reload. */
  refresh(): Promise<void>;
}

/**
 * ModelRuntime facade that also includes providers registered by extensions (an
 * extension that calls `registerProvider` / `createProvider` during resource
 * loading). A bare `ModelRegistry.create()` only knows built-in providers plus
 * models.json, so extension-registered providers were invisible to the
 * provider-listing and auth routes.
 *
 * The agent dir acts as cwd so project-local extensions stay out; global
 * package extensions always load. Not cached: these routes need fresh
 * credentials for auth status and login/logout to be truthful.
 */
export async function createModelRuntimeWithExtensions(): Promise<ModelRuntimeCompat> {
  const agentDir = getAgentDir();
  const services = await createAgentSessionServices({ cwd: agentDir, agentDir });
  const registry: ModelRegistry = services.modelRegistry;
  return {
    getAvailable: () => registry.getAvailable(),
    getAll: () => registry.getAll(),
    getError: () => registry.getError(),
    getProviders: () => {
      const seen = new Map<string, string>();
      for (const model of registry.getAvailable()) {
        if (!seen.has(model.provider)) {
          seen.set(model.provider, registry.getProviderDisplayName(model.provider) || model.provider);
        }
      }
      return [...seen.entries()].map(([id, name]) => ({ id, name }));
    },
    // ponytail: the vendored ModelRegistry tracks no extension-registered ids;
    // custom-provider detection falls back to "not a built-in provider".
    getRegisteredProviderIds: () => [],
    refresh: async () => {
      await registry.refreshAvailableModels();
      await registry.waitForPendingModelRefreshes(5000);
    },
  };
}