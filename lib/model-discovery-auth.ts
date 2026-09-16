import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { AuthStorage, ModelRegistry } from "@earendil-works/pi-coding-agent";

export interface ModelDiscoveryAuth {
  apiKey?: string;
  headers: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function resolveModelDiscoveryAuth(
  providerName: string,
  provider: Record<string, unknown>,
): Promise<ModelDiscoveryAuth> {
  let tempDir: string | undefined;
  try {
    tempDir = mkdtempSync(join(tmpdir(), "pi-web-model-discovery-"));
    const modelsPath = join(tempDir, "models.json");
    const discoveryModelId = "__pi_web_model_discovery__";
    writeFileSync(modelsPath, JSON.stringify({
      providers: {
        [providerName]: {
          ...provider,
          models: [{ id: discoveryModelId }],
        },
      },
    }, null, 2), "utf8");

    const authStorage = AuthStorage.create();
    const modelRegistry = ModelRegistry.create(authStorage, modelsPath);
    const loadError = modelRegistry.getError();
    if (loadError) throw new Error(loadError);
    const model = modelRegistry.getAll().find((m) => m.provider === providerName && m.id === discoveryModelId);
    if (!model) throw new Error(`Unable to load provider "${providerName}"`);

    const resolved = await modelRegistry.getApiKeyAndHeaders(model);
    if (resolved.ok) {
      return {
        apiKey: resolved.apiKey,
        headers: stringRecord(resolved.headers),
      };
    }

    return {
      apiKey: undefined,
      headers: {},
    };
  } finally {
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  }
}
