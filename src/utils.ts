// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Escape a string for safe use inside a PowerShell single-quoted string.
 * Single quotes inside single-quoted strings are escaped by doubling them.
 */
export function escapeForPs(input: string): string {
  return input.replace(/'/g, "''");
}

/**
 * Try to parse a string as JSON.  Returns undefined on failure.
 */
export function tryParseJson<T = any>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

/**
 * Truncate a string for display if it exceeds maxLen characters.
 */
export function truncate(text: string, maxLen = 500): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + "… (truncated)";
}
