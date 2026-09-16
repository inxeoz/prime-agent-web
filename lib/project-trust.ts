/* eslint-disable @typescript-eslint/no-unused-vars */
import type { ProjectTrustStatus } from "./api-types";

export function getProjectTrustStatus(_cwd: string, _agentDir: string): ProjectTrustStatus {
  return { requiresTrust: false, trusted: true };
}

export function trustProject(_cwd: string, _agentDir: string): ProjectTrustStatus {
  return { requiresTrust: false, trusted: true };
}

export function projectTrustReloadOptions(
  _cwd: string,
  _agentDir: string,
): { resolveProjectTrust: () => Promise<boolean> } | undefined {
  return undefined;
}
