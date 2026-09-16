import { join } from "node:path";
import { getAgentDir, AuthStorage } from "@earendil-works/pi-coding-agent";
import type { ProviderCredentialType } from "@/lib/provider-listing";

export type CredentialRemovalResult =
  | { status: "removed" }
  | { status: "not_found" }
  | { status: "type_mismatch"; storedType: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Store a provider credential without triggering a model-catalog refresh. */
export async function storeProviderCredential(
  providerId: string,
  credential: { type: ProviderCredentialType; [k: string]: unknown },
  authPath = join(getAgentDir(), "auth.json"),
): Promise<void> {
  const authStorage = AuthStorage.create(authPath === join(getAgentDir(), "auth.json") ? undefined : authPath);
  authStorage.set(providerId, credential as never);
}

/**
 * Removes a provider credential only when its current stored type matches.
 */
export async function removeStoredCredentialIfType(
  providerId: string,
  expectedType: ProviderCredentialType,
  authPath = join(getAgentDir(), "auth.json"),
): Promise<CredentialRemovalResult> {
  const authStorage = AuthStorage.create(authPath === join(getAgentDir(), "auth.json") ? undefined : authPath);
  const cred = authStorage.get(providerId);
  if (!cred) {
    return { status: "not_found" };
  }
  const storedType = isRecord(cred) && typeof cred.type === "string" ? cred.type : "unknown";
  if (storedType !== expectedType) {
    return { status: "type_mismatch", storedType };
  }
  const maybeVerified = authStorage as unknown as { removeVerified?: (p: string) => void };
  if (maybeVerified.removeVerified) {
    maybeVerified.removeVerified(providerId);
  } else {
    authStorage.remove(providerId);
  }
  return { status: "removed" };
}
