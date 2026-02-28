// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// ─── Runtime Configuration ───
// Environment-variable-based config with sensible defaults.

/** Default timeout (ms) for PowerShell commands executed via `run_powershell`. */
export const COMMAND_TIMEOUT_MS: number = (() => {
  const env = process.env.DLM_COMMAND_TIMEOUT_MS;
  if (env) {
    const parsed = Number(env);
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }
  return 180_000; // 180 seconds
})();
