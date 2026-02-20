// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// ─── Cmdlet Allow-list ───
// Only these cmdlets may be executed by the MCP server.
// Every command string is validated against this list before being sent to PowerShell.

export const ALLOWED_CMDLETS: ReadonlySet<string> = new Set([
  // Security & Compliance (IPPSSession)
  "Get-RetentionCompliancePolicy",
  "Get-RetentionComplianceRule",
  "Get-AdaptiveScope",
  "Get-ComplianceTag",

  // Exchange Online
  "Get-Mailbox",
  "Get-Recipient",
  "Get-MailboxStatistics",
  "Get-MailboxFolderStatistics",
  "Get-RetentionPolicy",
  "Get-RetentionPolicyTag",
  "Get-MailboxPlan",
  "Get-OrganizationConfig",
  "Get-MoveRequest",
  "Get-UnifiedGroup",
  "Get-User",
  "Test-ArchiveConnectivity",
  "Export-MailboxDiagnosticLogs",
]);

// Prefixes that are NEVER allowed (mutating cmdlets)
const BLOCKED_PREFIXES = [
  "Set-",
  "New-",
  "Remove-",
  "Enable-",
  "Start-",
  "Disable-",
  "Stop-",
  "Invoke-",
  "Add-",
  "Clear-",
  "Uninstall-",
  "Update-",
  "Register-",
  "Revoke-",
  "Grant-",
];

// PowerShell built-in / formatting cmdlets that are always safe
const SAFE_BUILTINS: ReadonlySet<string> = new Set([
  "Write-Host",
  "Write-Output",
  "Write-Warning",
  "Write-Error",
  "Select-Object",
  "Where-Object",
  "ForEach-Object",
  "Format-Table",
  "Format-List",
  "ConvertTo-Json",
  "ConvertFrom-Json",
  "Group-Object",
  "Sort-Object",
  "Measure-Object",
  "Out-String",
  "Join-String",
  "Compare-Object",
  "Tee-Object",
  "Get-Member",
  "Get-Date",
  "Get-ChildItem",
]);

// Regex that matches Verb-Noun cmdlet patterns
const CMDLET_RE = /\b([A-Z][a-z]+-[A-Z][A-Za-z]+)\b/g;

export interface ValidationResult {
  valid: boolean;
  violation?: string;
}

/**
 * Validate a PowerShell command string against the allowlist.
 * Returns `{ valid: true }` when safe, or `{ valid: false, violation }` when blocked.
 */
export function validateCommand(command: string): ValidationResult {
  const matches = [...command.matchAll(CMDLET_RE)].map((m) => m[1]);

  for (const cmdlet of matches) {
    // Connection cmdlets are only used during init, never from skill code
    if (cmdlet === "Connect-ExchangeOnline" || cmdlet === "Connect-IPPSSession") {
      continue;
    }

    // Check blocked prefixes first (fast-fail)
    for (const prefix of BLOCKED_PREFIXES) {
      if (cmdlet.startsWith(prefix)) {
        return {
          valid: false,
          violation: `Blocked cmdlet: ${cmdlet} — ${prefix}* cmdlets are not allowed`,
        };
      }
    }

    // Must be in the explicit allowlist or safe builtins
    if (!ALLOWED_CMDLETS.has(cmdlet) && !SAFE_BUILTINS.has(cmdlet)) {
      return {
        valid: false,
        violation: `Unknown cmdlet: ${cmdlet} — not in the allowlist`,
      };
    }
  }

  return { valid: true };
}
