// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// ─── TSG Diagnostic Evaluation Engine ───
// Reference-guide-aligned diagnostic checks for all 10 TSGs.
// Parses PowerShell Format-List output, evaluates against reference guide
// checklists, and produces structured findings with remediation.

// ─── Types ───

export type Severity = "error" | "warning" | "info" | "pass";

export const SEVERITY_ICON: Record<Severity, string> = {
  error: "\u274C",
  warning: "\u26A0\uFE0F",
  info: "\u2139\uFE0F",
  pass: "\u2705",
};

export interface DiagnosticCheck {
  refNumber: number;
  check: string;
  severity: Severity;
  finding: string;
  remediation: string | null;
  escalation: string | null;
  crossReferences: string[];
}

export interface TsgCommand {
  step: string;
  command: string;
  success: boolean;
  output: string;
  durationMs: number;
}

export interface TsgSummary {
  errors: number;
  warnings: number;
  info: number;
  passed: number;
  text: string;
  overallStatus: "healthy" | "warnings" | "issues" | "critical";
}

export interface TsgResult {
  tsg: string;
  tsgNumber: number;
  reference: string;
  timestamp: string;
  commands: TsgCommand[];
  diagnostics: DiagnosticCheck[];
  summary: TsgSummary;
}

// ─── Output Parsers ───

type FLRecord = Record<string, string>;

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

export function parseFormatList(rawOutput: string): FLRecord[] {
  const clean = stripAnsi(rawOutput).trim();
  if (!clean) return [];
  const blocks = clean.split(/\r?\n\s*\r?\n/).filter((b) => b.trim());
  const records: FLRecord[] = [];
  for (const block of blocks) {
    const record: FLRecord = {};
    for (const line of block.split(/\r?\n/)) {
      const match = line.match(/^(\S+)\s*:\s*(.*)/);
      if (match) record[match[1].trim()] = match[2].trim();
    }
    if (Object.keys(record).length > 0) records.push(record);
  }
  return records;
}

export function parseSingleRecord(rawOutput: string): FLRecord {
  return parseFormatList(rawOutput)[0] ?? {};
}

/** Check if a Format-List value is empty ({} or blank) */
function isEmpty(val: string | undefined): boolean {
  if (!val) return true;
  const v = val.trim();
  return v === "" || v === "{}" || v === "{}," || v === "$null";
}

export function parseSizeToBytes(sizeStr: string): number | null {
  const match = sizeStr.match(/\(([\d,]+)\s*bytes?\)/i);
  if (match) return parseInt(match[1].replace(/,/g, ""), 10);
  return null;
}

function parsePsDate(dateStr: string): Date | null {
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

export function daysSince(dateStr: string): number | null {
  const d = parsePsDate(dateStr);
  if (!d) return null;
  return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
}

function boolVal(record: FLRecord, key: string): boolean | null {
  const v = record[key];
  if (!v) return null;
  if (v === "True") return true;
  if (v === "False") return false;
  return null;
}

// ─── Summary ───

export function computeSummary(diagnostics: DiagnosticCheck[]): TsgSummary {
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const info = diagnostics.filter((d) => d.severity === "info").length;
  const passed = diagnostics.filter((d) => d.severity === "pass").length;
  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors > 1 ? "s" : ""}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings > 1 ? "s" : ""}`);
  if (info > 0) parts.push(`${info} informational`);
  const text = parts.length > 0 ? parts.join(", ") : "All checks passed";
  const overallStatus =
    errors >= 3
      ? "critical"
      : errors > 0
        ? "issues"
        : warnings > 0
          ? "warnings"
          : "healthy";
  return { errors, warnings, info, passed, text, overallStatus };
}

// ─── Evaluator Dispatch ───

type TsgEvaluator = (commands: TsgCommand[]) => DiagnosticCheck[];

const TSG_EVALUATORS: Record<number, TsgEvaluator> = {
  1: evaluateTsg1,
  2: evaluateTsg2,
  3: evaluateTsg3,
  4: evaluateTsg4,
  5: evaluateTsg5,
  6: evaluateTsg6,
  7: evaluateTsg7,
  8: evaluateTsg8,
  9: evaluateTsg9,
  10: evaluateTsg10,
};

export function evaluateTsg(
  tsgNumber: number,
  commands: TsgCommand[],
): DiagnosticCheck[] {
  const evaluator = TSG_EVALUATORS[tsgNumber];
  if (!evaluator) throw new Error(`No evaluator for TSG ${tsgNumber}`);
  return evaluator(commands);
}

// ─── TSG 1: Retention Policy Not Applying ───

function evaluateTsg1(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step3Records = parseFormatList(commands[2]?.output ?? "");
  const step4 = parseSingleRecord(commands[3]?.output ?? "");
  const step5 = parseSingleRecord(commands[4]?.output ?? "");

  // 1. Distribution status
  const distStatus = step1["DistributionStatus"] ?? "Unknown";
  if (distStatus === "Success") {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "pass", finding: "DistributionStatus = Success", remediation: null, escalation: null, crossReferences: [] });
  } else if (distStatus === "Error" || distStatus === "PolicySyncTimeout") {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "error", finding: `DistributionStatus = ${distStatus}`, remediation: "Run Set-RetentionCompliancePolicy -RetryDistribution. If persistent, follow Policy Stuck in Error TSG.", escalation: "If retry fails after 48 hrs, escalate for backend binding cleanup.", crossReferences: ["policy-stuck-error.md"] });
  } else if (distStatus === "Pending") {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "warning", finding: "DistributionStatus = Pending \u2014 policy may still be distributing.", remediation: "Wait for distribution to complete (up to 24\u201348 hrs for large tenants).", escalation: null, crossReferences: ["policy-stuck-error.md"] });
  } else {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "warning", finding: `DistributionStatus = ${distStatus}`, remediation: "Investigate non-standard distribution status.", escalation: null, crossReferences: ["policy-stuck-error.md"] });
  }

  // 2. Retention rule exists
  const hasRules = step3Records.length > 0 && step3Records.some((r) => r["Name"]);
  if (hasRules) {
    const ruleNames = step3Records.map((r) => r["Name"]).filter(Boolean).join(", ");
    const durations = step3Records.map((r) => r["RetentionDuration"]).filter(Boolean).join(", ");
    checks.push({ refNumber: 2, check: "Retention rule exists", severity: "pass", finding: `Rule(s): ${ruleNames}. Duration(s): ${durations}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "Retention rule exists", severity: "error", finding: "No retention rules found for this policy.", remediation: "Create a retention rule: New-RetentionComplianceRule -Policy \"<PolicyName>\" -RetentionDuration <days> -RetentionComplianceAction Keep.", escalation: null, crossReferences: [] });
  }

  // 3. Target in scope
  const locations: Record<string, string> = {};
  for (const key of ["ExchangeLocation", "SharePointLocation", "OneDriveLocation", "TeamsChannelLocation"]) {
    const val = step4[key];
    if (val && !isEmpty(val)) locations[key] = val;
  }
  const configuredKeys = Object.keys(locations);
  if (configuredKeys.length > 0) {
    const summary = configuredKeys.map((k) => `${k}: ${locations[k]}`).join("; ");
    checks.push({ refNumber: 3, check: "Target in scope", severity: "pass", finding: `Workload locations configured: ${summary}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 3, check: "Target in scope", severity: "error", finding: "All workload locations are empty \u2014 policy has no target scope.", remediation: "Update the policy scope to include target locations. Remove the user from any exception list.", escalation: null, crossReferences: [] });
  }

  // 4. Adaptive scope
  const adaptiveScope = step4["AdaptiveScopeLocation"] ?? "";
  if (!isEmpty(adaptiveScope)) {
    checks.push({ refNumber: 4, check: "Adaptive scope", severity: "info", finding: `Adaptive scope configured: ${adaptiveScope}. See Adaptive Scope TSG for full validation.`, remediation: null, escalation: null, crossReferences: ["adaptive-scope.md"] });
  } else if (configuredKeys.length === 0) {
    checks.push({ refNumber: 4, check: "Adaptive scope", severity: "warning", finding: "No adaptive scope configured and no static locations set.", remediation: "Configure either static workload locations or an adaptive scope.", escalation: null, crossReferences: ["adaptive-scope.md"] });
  }

  // 5. Hold stamped on mailbox
  const inPlaceHolds = step5["InPlaceHolds"] ?? "";
  const holdsClean = inPlaceHolds.replace(/[{}]/g, "").trim();
  const holdEntries = holdsClean ? holdsClean.split(",").map((h) => h.trim()).filter(Boolean) : [];
  if (holdEntries.length > 0) {
    checks.push({ refNumber: 5, check: "Hold stamped on mailbox", severity: "pass", finding: `InPlaceHolds: ${holdEntries.join(", ")}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 5, check: "Hold stamped on mailbox", severity: "warning", finding: "No InPlaceHolds found on the mailbox. Policy may not be applied yet.", remediation: "Retry distribution: Set-RetentionCompliancePolicy -RetryDistribution. Wait 24\u201348 hrs.", escalation: "If still not stamped after 48 hrs, escalate for backend investigation.", crossReferences: [] });
  }

  // 6. Propagation window
  const mode = step1["Mode"] ?? "";
  const enabled = step1["Enabled"] ?? "";
  if (enabled === "True" && mode !== "PendingDeletion") {
    checks.push({ refNumber: 6, check: "Propagation window", severity: "info", finding: "Exchange: up to 7 days. SharePoint/OneDrive: 24 hrs. Teams: 48\u201372 hrs.", remediation: "Wait for the propagation window to elapse, then re-verify.", escalation: null, crossReferences: [] });
  }

  return checks;
}

// ─── TSG 2: Policy Stuck in Error ───

function evaluateTsg2(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step2 = parseSingleRecord(commands[1]?.output ?? "");
  const step3 = parseSingleRecord(commands[2]?.output ?? "");
  const step4Records = parseFormatList(commands[3]?.output ?? "");

  // 1. Distribution status
  const distStatus = step1["DistributionStatus"] ?? "Unknown";
  if (distStatus === "Success") {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "pass", finding: "DistributionStatus = Success", remediation: null, escalation: null, crossReferences: [] });
  } else if (distStatus === "Error" || distStatus === "PolicySyncTimeout") {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "error", finding: `DistributionStatus = ${distStatus}`, remediation: "Run Set-RetentionCompliancePolicy -RetryDistribution. Wait 24\u201348 hrs.", escalation: "If still failing after 48 hrs with no duplicate objects, escalate for backend binding cleanup.", crossReferences: [] });
  } else if (distStatus === "Pending") {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "warning", finding: "DistributionStatus = Pending \u2014 distribution in progress.", remediation: "Wait up to 24\u201348 hrs for distribution to complete.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "Distribution status", severity: "warning", finding: `DistributionStatus = ${distStatus}`, remediation: "Investigate non-standard distribution status.", escalation: null, crossReferences: [] });
  }

  // 2. Pending deletion
  const mode = step2["Mode"] ?? step1["Mode"] ?? "";
  if (mode === "PendingDeletion") {
    checks.push({ refNumber: 2, check: "Pending deletion", severity: "error", finding: "Mode = PendingDeletion \u2014 policy is stuck in deletion.", remediation: "Force-delete: Remove-RetentionCompliancePolicy -ForceDeletion.", escalation: "If force-delete fails, escalate for backend cleanup.", crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "Pending deletion", severity: "pass", finding: `Mode = ${mode || "N/A"} \u2014 not pending deletion.`, remediation: null, escalation: null, crossReferences: [] });
  }

  // 3. Policy age
  const whenCreated = step2["WhenCreated"] ?? "";
  if (whenCreated) {
    const ageDays = daysSince(whenCreated);
    if (ageDays !== null && ageDays < 2) {
      checks.push({ refNumber: 3, check: "Policy age", severity: "info", finding: `Policy created ${ageDays.toFixed(1)} days ago \u2014 within normal 48-hr distribution window.`, remediation: "Wait up to 48 hours for initial distribution to complete.", escalation: null, crossReferences: [] });
    } else if (ageDays !== null) {
      checks.push({ refNumber: 3, check: "Policy age", severity: "pass", finding: `Policy created ${ageDays.toFixed(0)} days ago \u2014 past initial distribution window.`, remediation: null, escalation: null, crossReferences: [] });
    }
  }

  // 4. Policy type
  const policyType = step2["Type"] ?? "";
  if (policyType) {
    checks.push({ refNumber: 4, check: "Policy type", severity: "info", finding: `Type = ${policyType}`, remediation: null, escalation: null, crossReferences: [] });
  }

  // 5. Workload locations
  const locKeys = ["ExchangeLocation", "SharePointLocation", "TeamsChannelLocation", "AdaptiveScopeLocation"];
  const configured = locKeys.filter((k) => !isEmpty(step3[k]));
  if (configured.length > 0) {
    checks.push({ refNumber: 5, check: "Workload locations", severity: "pass", finding: `Configured: ${configured.join(", ")}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 5, check: "Workload locations", severity: "warning", finding: "All workload locations are empty.", remediation: "Add target locations to the policy.", escalation: null, crossReferences: [] });
  }

  // 6. Duplicate objects
  if (step4Records.length > 1) {
    const names = step4Records.map((r) => r["Name"]).join(", ");
    checks.push({ refNumber: 6, check: "Duplicate object check", severity: "error", finding: `${step4Records.length} duplicate recipients found: ${names}. Duplicates block policy distribution.`, remediation: "Remove the duplicate object, resync, then retry distribution.", escalation: "If duplicates cannot be resolved, escalate for AD cleanup.", crossReferences: [] });
  } else if (step4Records.length === 1) {
    checks.push({ refNumber: 6, check: "Duplicate object check", severity: "pass", finding: `Single recipient found: ${step4Records[0]["Name"] ?? "N/A"} (${step4Records[0]["RecipientType"] ?? ""})`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 6, check: "Duplicate object check", severity: "info", finding: "No recipients matched the filter.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 7. Adaptive scope age
  const adaptiveScope = step3["AdaptiveScopeLocation"] ?? "";
  if (!isEmpty(adaptiveScope) && whenCreated) {
    const ageDays = daysSince(whenCreated);
    if (ageDays !== null && ageDays < 5) {
      checks.push({ refNumber: 7, check: "Adaptive scope age", severity: "warning", finding: `Adaptive scope used but policy is only ${ageDays.toFixed(1)} days old. Scope population takes up to 5 days.`, remediation: "Wait at least 5 days for the adaptive scope to fully populate.", escalation: null, crossReferences: ["adaptive-scope.md"] });
    }
  }

  return checks;
}

// ─── TSG 3: Items Not Moving to Archive ───

function evaluateTsg3(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step2Records = parseFormatList(commands[1]?.output ?? "");
  const step3Raw = stripAnsi(commands[2]?.output ?? "").trim();
  const step4 = parseSingleRecord(commands[3]?.output ?? "");
  const step5Raw = stripAnsi(commands[4]?.output ?? "").trim();
  const step6 = parseSingleRecord(commands[5]?.output ?? "");

  // 1. Archive enabled
  const archiveStatus = step1["ArchiveStatus"] ?? "None";
  if (archiveStatus === "Active") {
    checks.push({ refNumber: 1, check: "Archive enabled", severity: "pass", finding: "ArchiveStatus = Active", remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "Archive enabled", severity: "error", finding: `ArchiveStatus = ${archiveStatus}`, remediation: "Enable the archive: Enable-Mailbox -Identity <UPN> -Archive.", escalation: null, crossReferences: [] });
  }

  // 2. MoveToArchive tag exists
  const archiveTags = step2Records.filter((r) => r["RetentionEnabled"] === "True");
  if (archiveTags.length > 0) {
    const tagNames = archiveTags.map((r) => r["Name"]).join(", ");
    checks.push({ refNumber: 2, check: "MoveToArchive tag exists", severity: "pass", finding: `Active archive tags: ${tagNames}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "MoveToArchive tag exists", severity: "error", finding: "No enabled MoveToArchive retention tags found.", remediation: "Assign a retention policy with MoveToArchive tags: Set-Mailbox -RetentionPolicy \"Default MRM Policy\".", escalation: null, crossReferences: [] });
  }

  // 3. Retention hold
  const retentionHold = boolVal(step1, "RetentionHoldEnabled");
  if (retentionHold === true) {
    checks.push({ refNumber: 3, check: "Retention hold", severity: "error", finding: "RetentionHoldEnabled = True \u2014 MRM processing is paused.", remediation: "Disable: Set-Mailbox -RetentionHoldEnabled $false.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 3, check: "Retention hold", severity: "pass", finding: "RetentionHoldEnabled = False", remediation: null, escalation: null, crossReferences: [] });
  }

  // 4. ELC processing (mailbox level)
  const elcDisabledMbx = boolVal(step1, "ElcProcessingDisabled");
  if (elcDisabledMbx === true) {
    checks.push({ refNumber: 4, check: "ELC processing (mailbox)", severity: "error", finding: "ElcProcessingDisabled = True on mailbox.", remediation: "Enable: Set-Mailbox -ElcProcessingDisabled $false.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 4, check: "ELC processing (mailbox)", severity: "pass", finding: "ElcProcessingDisabled = False on mailbox", remediation: null, escalation: null, crossReferences: [] });
  }

  // 5. ELC processing (org level)
  const elcDisabledOrg = boolVal(step4, "ElcProcessingDisabled");
  if (elcDisabledOrg === true) {
    checks.push({ refNumber: 5, check: "ELC processing (org)", severity: "error", finding: "ElcProcessingDisabled = True at org level.", remediation: "Enable: Set-OrganizationConfig -ElcProcessingDisabled $false.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 5, check: "ELC processing (org)", severity: "pass", finding: "ElcProcessingDisabled = False at org level", remediation: null, escalation: null, crossReferences: [] });
  }

  // 6. License validation
  if (step3Raw) {
    const hasArchiveLicense = /BPOS_S_Enterprise|E3|E5|Archive/i.test(step3Raw);
    if (hasArchiveLicense) {
      checks.push({ refNumber: 6, check: "License validation", severity: "pass", finding: `License: ${step3Raw}`, remediation: null, escalation: null, crossReferences: [] });
    } else {
      checks.push({ refNumber: 6, check: "License validation", severity: "warning", finding: `License: ${step3Raw} \u2014 may not include archiving.`, remediation: "Verify the user has E3, E5, or Exchange Online Archiving add-on license.", escalation: null, crossReferences: [] });
    }
  }

  // 7. ELC last success
  if (step5Raw) {
    checks.push({ refNumber: 7, check: "ELC last run", severity: "info", finding: `ELCLastSuccessTimestamp data: ${step5Raw.substring(0, 100)}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 7, check: "ELC last run", severity: "warning", finding: "ELCLastSuccessTimestamp not found \u2014 MRM may not have run on this mailbox.", remediation: "Trigger manually: Start-ManagedFolderAssistant -Identity <UPN>. Wait 24\u201348 hrs.", escalation: null, crossReferences: [] });
  }

  // 8. Account status
  const accountDisabled = boolVal(step1, "AccountDisabled");
  const isShared = boolVal(step1, "IsShared");
  if (accountDisabled === true && isShared !== true) {
    checks.push({ refNumber: 8, check: "Account status", severity: "warning", finding: "AccountDisabled = True (non-shared mailbox). MRM may not process disabled accounts.", remediation: "Re-enable the account or convert to shared mailbox.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 8, check: "Account status", severity: "pass", finding: `AccountDisabled = ${accountDisabled ?? "N/A"}, IsShared = ${isShared ?? "N/A"}`, remediation: null, escalation: null, crossReferences: [] });
  }

  // 9. Active move requests
  const moveStatus = step6["Status"];
  if (moveStatus && moveStatus !== "Completed") {
    checks.push({ refNumber: 9, check: "Active move requests", severity: "warning", finding: `Move request status: ${moveStatus} (${step6["PercentComplete"] ?? "?"}% complete). Archive moves paused during migration.`, remediation: "Wait for the move request to complete.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 9, check: "Active move requests", severity: "pass", finding: moveStatus ? "Move request completed." : "No active move requests.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 10. Retention policy assignment
  const retPolicy = step1["RetentionPolicy"] ?? "";
  if (retPolicy) {
    checks.push({ refNumber: 10, check: "MRM policy assigned", severity: "pass", finding: `RetentionPolicy = ${retPolicy}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 10, check: "MRM policy assigned", severity: "error", finding: "No MRM retention policy assigned to mailbox.", remediation: "Assign: Set-Mailbox -RetentionPolicy \"Default MRM Policy\".", escalation: null, crossReferences: [] });
  }

  return checks;
}

// ─── TSG 4: Auto-Expanding Archive ───

function evaluateTsg4(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step2 = parseSingleRecord(commands[1]?.output ?? "");
  const step3 = parseSingleRecord(commands[2]?.output ?? "");
  const step4Raw = stripAnsi(commands[3]?.output ?? "").trim();
  const step5Raw = stripAnsi(commands[4]?.output ?? "").trim();

  // 1. Org auto-expanding
  const orgEnabled = boolVal(step1, "AutoExpandingArchiveEnabled");
  if (orgEnabled === true) {
    checks.push({ refNumber: 1, check: "Org auto-expanding enabled", severity: "pass", finding: "AutoExpandingArchiveEnabled = True (org level)", remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "Org auto-expanding enabled", severity: "warning", finding: "AutoExpandingArchiveEnabled = False at org level.", remediation: "Enable: Set-OrganizationConfig -AutoExpandingArchive.", escalation: null, crossReferences: [] });
  }

  // 2. User auto-expanding
  const userEnabled = boolVal(step2, "AutoExpandingArchiveEnabled");
  if (userEnabled === true) {
    checks.push({ refNumber: 2, check: "User auto-expanding enabled", severity: "pass", finding: "AutoExpandingArchiveEnabled = True (user level)", remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "User auto-expanding enabled", severity: "warning", finding: "AutoExpandingArchiveEnabled = False at user level.", remediation: "Enable: Enable-Mailbox -Identity <UPN> -AutoExpandingArchive.", escalation: null, crossReferences: [] });
  }

  // 3. Archive status
  const archiveStatus = step2["ArchiveStatus"] ?? "None";
  if (archiveStatus === "Active") {
    checks.push({ refNumber: 3, check: "Archive status", severity: "pass", finding: "ArchiveStatus = Active", remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 3, check: "Archive status", severity: "error", finding: `ArchiveStatus = ${archiveStatus} \u2014 archive must be active for auto-expanding to function.`, remediation: "Enable archive first: Enable-Mailbox -Identity <UPN> -Archive.", escalation: null, crossReferences: ["items-not-moving-to-archive.md"] });
  }

  // 4. Archive size (threshold: 90 GB)
  if (step3["TotalItemSize"]) {
    const archiveBytes = parseSizeToBytes(step3["TotalItemSize"]);
    const thresholdBytes = 90 * 1024 * 1024 * 1024; // 90 GB
    if (archiveBytes !== null) {
      const archiveGB = (archiveBytes / (1024 * 1024 * 1024)).toFixed(1);
      if (archiveBytes >= thresholdBytes) {
        checks.push({ refNumber: 4, check: "Archive size threshold", severity: "pass", finding: `Archive size: ${archiveGB} GB (\u2265 90 GB threshold for auto-expansion).`, remediation: null, escalation: null, crossReferences: [] });
      } else {
        checks.push({ refNumber: 4, check: "Archive size threshold", severity: "info", finding: `Archive size: ${archiveGB} GB (below 90 GB auto-expansion threshold).`, remediation: "Auto-expansion triggers at \u2265 90 GB. No action needed if archive is not full.", escalation: null, crossReferences: [] });
      }
    }
  } else {
    checks.push({ refNumber: 4, check: "Archive size threshold", severity: "info", finding: "No archive statistics available (archive may not be provisioned).", remediation: null, escalation: null, crossReferences: [] });
  }

  // 5. Aux archives
  const auxCount = step4Raw ? (step4Raw.match(/AuxArchive/gi) || []).length : 0;
  if (auxCount > 0) {
    checks.push({ refNumber: 5, check: "Auxiliary archives", severity: auxCount >= 50 ? "warning" : "pass", finding: `${auxCount} auxiliary archive(s) found.${auxCount >= 50 ? " At maximum limit (50)." : ""}`, remediation: auxCount >= 50 ? "Maximum aux archives reached. Implement retention delete policies to reduce archive size." : null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 5, check: "Auxiliary archives", severity: "info", finding: "No auxiliary archives provisioned yet.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 6. Litigation hold quota
  const litHold = boolVal(step2, "LitigationHoldEnabled");
  const archiveQuota = step2["ArchiveQuota"] ?? "";
  if (litHold === true) {
    const quotaBytes = parseSizeToBytes(archiveQuota);
    const is110GB = quotaBytes !== null && quotaBytes >= 110 * 1024 * 1024 * 1024;
    if (is110GB) {
      checks.push({ refNumber: 6, check: "Litigation hold quota", severity: "pass", finding: `Litigation hold enabled with ArchiveQuota = ${archiveQuota} (correctly bumped to 110 GB).`, remediation: null, escalation: null, crossReferences: [] });
    } else {
      checks.push({ refNumber: 6, check: "Litigation hold quota", severity: "warning", finding: `Litigation hold enabled but ArchiveQuota = ${archiveQuota}. Should be 110 GB.`, remediation: "Re-enable auto-expanding: Enable-Mailbox -AutoExpandingArchive (bumps quota to 110 GB).", escalation: null, crossReferences: [] });
    }
  } else {
    checks.push({ refNumber: 6, check: "Litigation hold quota", severity: "pass", finding: "No litigation hold \u2014 quota adjustment not needed.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 7. Archive connectivity
  if (step5Raw) {
    const success = step5Raw.toLowerCase().includes("success");
    const logonFail = step5Raw.toLowerCase().includes("couldn't log on");
    if (success) {
      checks.push({ refNumber: 7, check: "Archive connectivity", severity: "pass", finding: "Archive connectivity test succeeded.", remediation: null, escalation: null, crossReferences: [] });
    } else if (logonFail) {
      checks.push({ refNumber: 7, check: "Archive connectivity", severity: "warning", finding: `Archive connectivity: ${step5Raw}`, remediation: "Archive may not be provisioned. Enable archive first, then re-test.", escalation: "If archive is enabled but connectivity fails, escalate.", crossReferences: [] });
    } else {
      checks.push({ refNumber: 7, check: "Archive connectivity", severity: "info", finding: `Archive connectivity result: ${step5Raw.substring(0, 200)}`, remediation: null, escalation: null, crossReferences: [] });
    }
  }

  // 8. ArchiveGuid
  const archiveGuid = step2["ArchiveGuid"] ?? "";
  if (archiveGuid === "00000000-0000-0000-0000-000000000000") {
    checks.push({ refNumber: 8, check: "Archive provisioned", severity: "info", finding: "ArchiveGuid is empty (all zeros) \u2014 archive has never been provisioned.", remediation: null, escalation: null, crossReferences: [] });
  }

  return checks;
}

// ─── TSG 5: Inactive Mailbox ───

function evaluateTsg5(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1Records = parseFormatList(commands[0]?.output ?? "");
  const step2Records = parseFormatList(commands[1]?.output ?? "");
  const step3Records = parseFormatList(commands[2]?.output ?? "");

  // 1. Inactive mailboxes found
  if (step1Records.length > 0) {
    const upns = step1Records.map((r) => r["UserPrincipalName"]).filter(Boolean).join(", ");
    checks.push({ refNumber: 1, check: "Inactive mailbox exists", severity: "pass", finding: `${step1Records.length} inactive mailbox(es) found: ${upns}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "Inactive mailbox exists", severity: "info", finding: "No inactive mailboxes found in tenant.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 2. Soft-deleted mailboxes & recovery window
  if (step2Records.length > 0) {
    for (const rec of step2Records) {
      const upn = rec["UserPrincipalName"] ?? "unknown";
      const whenDeleted = rec["WhenSoftDeleted"] ?? "";
      const days = whenDeleted ? daysSince(whenDeleted) : null;
      if (days !== null && days <= 30) {
        checks.push({ refNumber: 2, check: `Soft-deleted: ${upn}`, severity: "warning", finding: `Soft-deleted ${days.toFixed(0)} days ago (within 30-day recovery window).`, remediation: "Recoverable: Restore user in Entra ID, apply hold, re-delete. Or use New-MailboxRestoreRequest.", escalation: null, crossReferences: [] });
      } else if (days !== null) {
        checks.push({ refNumber: 2, check: `Soft-deleted: ${upn}`, severity: "error", finding: `Soft-deleted ${days.toFixed(0)} days ago (past 30-day recovery window).`, remediation: "Data may be permanently lost. No recovery possible.", escalation: null, crossReferences: [] });
      }
    }
  } else {
    checks.push({ refNumber: 2, check: "Soft-deleted mailboxes", severity: "info", finding: "No soft-deleted mailboxes found.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 3. Hold at deletion
  for (const rec of step1Records) {
    const upn = rec["UserPrincipalName"] ?? "unknown";
    const holds = rec["InPlaceHolds"] ?? "";
    const litHold = boolVal(rec, "LitigationHoldEnabled");
    const hasHold = !isEmpty(holds) || litHold === true;
    if (!hasHold) {
      checks.push({ refNumber: 3, check: `Hold on inactive: ${upn}`, severity: "error", finding: "No InPlaceHolds or Litigation Hold \u2014 mailbox may not be retained.", remediation: "For future: apply org-wide retention policy or litigation hold before user deletion.", escalation: null, crossReferences: ["retention-policy-not-applying.md"] });
    }
  }

  // 4. Retention policy coverage
  if (step3Records.length > 0) {
    const policies = step3Records.filter((r) => boolVal(r, "Enabled") === true && r["Mode"] !== "PendingDeletion");
    if (policies.length > 0) {
      const names = policies.map((r) => r["Name"]).join(", ");
      checks.push({ refNumber: 4, check: "Retention policy coverage", severity: "pass", finding: `Active Exchange-wide retention policies: ${names}`, remediation: null, escalation: null, crossReferences: [] });
    } else {
      checks.push({ refNumber: 4, check: "Retention policy coverage", severity: "warning", finding: "Retention policies found but none are active (enabled + not pending deletion).", remediation: "Ensure at least one org-wide retention policy is active for Exchange.", escalation: null, crossReferences: ["retention-policy-not-applying.md"] });
    }
  } else {
    checks.push({ refNumber: 4, check: "Retention policy coverage", severity: "warning", finding: "No retention policies targeting all Exchange locations.", remediation: "Create an org-wide retention policy with ExchangeLocation = All to protect future mailboxes.", escalation: null, crossReferences: ["retention-policy-not-applying.md"] });
  }

  // 5. Prevention
  checks.push({ refNumber: 5, check: "Prevention", severity: "info", finding: "Ensure org-wide retention policy covers Exchange before user deletion. Verify hold stamp on mailbox. Consider Litigation Hold for critical mailboxes.", remediation: null, escalation: null, crossReferences: [] });

  return checks;
}

// ─── TSG 6: SubstrateHolds / RI Quota ───

function evaluateTsg6(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1Records = parseFormatList(commands[0]?.output ?? "");
  const step2 = parseSingleRecord(commands[1]?.output ?? "");
  const step3Raw = stripAnsi(commands[2]?.output ?? "").trim();
  const step4Raw = stripAnsi(commands[3]?.output ?? "").trim();
  const step5Raw = stripAnsi(commands[4]?.output ?? "").trim();

  // 1. Dominant RI folder
  const substrateHolds = step1Records.find((r) => r["Name"] === "SubstrateHolds");
  const discoveryHolds = step1Records.find((r) => r["Name"] === "DiscoveryHolds");
  const purges = step1Records.find((r) => r["Name"] === "Purges");
  const dominantFolders: string[] = [];
  for (const folder of step1Records) {
    const items = parseInt(folder["ItemsInFolder"] ?? "0", 10);
    if (items > 0) dominantFolders.push(`${folder["Name"]}: ${items} items`);
  }
  checks.push({ refNumber: 1, check: "Recoverable Items folders", severity: "info", finding: dominantFolders.length > 0 ? dominantFolders.join("; ") : "No items in Recoverable Items.", remediation: null, escalation: null, crossReferences: [] });

  // 2. Litigation hold
  const litHold = boolVal(step2, "LitigationHoldEnabled");
  const litDuration = step2["LitigationHoldDuration"] ?? "";
  if (litHold === true) {
    checks.push({ refNumber: 2, check: "Litigation hold", severity: "warning", finding: `LitigationHoldEnabled = True${litDuration ? ` (Duration: ${litDuration})` : " (Unlimited)"}. All items retained in RI.`, remediation: "Remove if not needed: Set-Mailbox -LitigationHoldEnabled $false. Otherwise increase RecoverableItemsQuota.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "Litigation hold", severity: "pass", finding: "No litigation hold.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 3. Delay hold
  const delayHold = boolVal(step2, "DelayHoldApplied");
  if (delayHold === true) {
    checks.push({ refNumber: 3, check: "Delay hold", severity: "warning", finding: "DelayHoldApplied = True \u2014 30-day grace period after hold removal.", remediation: "Wait 30 days for automatic expiration, or force remove: Set-Mailbox -RemoveDelayHoldApplied.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 3, check: "Delay hold", severity: "pass", finding: "No delay hold applied.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 4. Delay release hold
  const delayRelease = boolVal(step2, "DelayReleaseHoldApplied");
  if (delayRelease === true) {
    checks.push({ refNumber: 4, check: "Delay release hold", severity: "warning", finding: "DelayReleaseHoldApplied = True.", remediation: "Wait for automatic expiration or escalate if persistent.", escalation: "If DelayReleaseHoldApplied persists beyond 30 days, escalate.", crossReferences: [] });
  } else {
    checks.push({ refNumber: 4, check: "Delay release hold", severity: "pass", finding: "No delay release hold.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 5. Compliance tag hold
  const compTagHold = boolVal(step2, "ComplianceTagHoldApplied");
  if (compTagHold === true) {
    checks.push({ refNumber: 5, check: "Compliance tag hold", severity: "warning", finding: "ComplianceTagHoldApplied = True \u2014 a retention label is preventing cleanup.", remediation: "Review and remove the retention label if no longer needed.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 5, check: "Compliance tag hold", severity: "pass", finding: "No compliance tag hold.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 6. InPlaceHolds (Purview/eDiscovery)
  const inPlaceHolds = step2["InPlaceHolds"] ?? "";
  const holdsClean = inPlaceHolds.replace(/[{}]/g, "").trim();
  const holdEntries = holdsClean ? holdsClean.split(",").map((h) => h.trim()).filter(Boolean) : [];
  if (holdEntries.length > 0) {
    const classified = holdEntries.map((h) => {
      if (h.startsWith("mbx")) return `${h} (Purview/Exchange)`;
      if (h.startsWith("cld")) return `${h} (Purview/Group)`;
      if (h.startsWith("UniH")) return `${h} (eDiscovery)`;
      if (h.startsWith("skp")) return `${h} (SPO/OD)`;
      return h;
    });
    checks.push({ refNumber: 6, check: "InPlaceHolds", severity: "info", finding: `${holdEntries.length} hold(s): ${classified.join("; ")}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 6, check: "InPlaceHolds", severity: "pass", finding: "No InPlaceHolds on mailbox.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 7. Org-level holds
  if (step3Raw && step3Raw !== "{}" && step3Raw.length > 0) {
    checks.push({ refNumber: 7, check: "Org-level holds", severity: "warning", finding: `Org-level InPlaceHolds: ${step3Raw}`, remediation: "Review org-level holds. Remove if not needed.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 7, check: "Org-level holds", severity: "pass", finding: "No org-level holds.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 8. Dumpster expiration
  if (step4Raw) {
    checks.push({ refNumber: 8, check: "Dumpster expiration", severity: "pass", finding: `DumpsterExpiration data found.`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 8, check: "Dumpster expiration", severity: "warning", finding: "DumpsterExpirationLastSuccessRunTimestamp not found.", remediation: "Dumpster expiration may not be running. Monitor.", escalation: "If stuck for > 7 days, escalate.", crossReferences: [] });
  }

  // 9. Quota utilization
  if (step5Raw) {
    checks.push({ refNumber: 9, check: "Quota utilization", severity: "info", finding: step5Raw.replace(/\r?\n/g, " | "), remediation: null, escalation: null, crossReferences: [] });
  }

  return checks;
}

// ─── TSG 7: Teams Messages Not Deleting ───

function evaluateTsg7(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step2 = parseSingleRecord(commands[1]?.output ?? "");
  const step3 = parseSingleRecord(commands[2]?.output ?? "");
  const step4Raw = stripAnsi(commands[3]?.output ?? "").trim();

  // 1. Policy targets Teams
  const teamsChannel = step1["TeamsChannelLocation"] ?? "";
  const teamsChat = step1["TeamsChatLocation"] ?? "";
  const hasTeamsLocations = !isEmpty(teamsChannel) || !isEmpty(teamsChat);
  if (hasTeamsLocations) {
    const details = [!isEmpty(teamsChannel) ? `TeamsChannelLocation: ${teamsChannel}` : null, !isEmpty(teamsChat) ? `TeamsChatLocation: ${teamsChat}` : null].filter(Boolean).join("; ");
    checks.push({ refNumber: 1, check: "Policy targets Teams", severity: "pass", finding: details, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "Policy targets Teams", severity: "error", finding: "Neither TeamsChannelLocation nor TeamsChatLocation is configured.", remediation: "Update the policy to include Teams locations.", escalation: null, crossReferences: [] });
  }

  // 2. Distribution status
  const distStatus = step1["DistributionStatus"] ?? "Unknown";
  if (distStatus === "Success") {
    checks.push({ refNumber: 2, check: "Distribution status", severity: "pass", finding: "DistributionStatus = Success", remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "Distribution status", severity: "error", finding: `DistributionStatus = ${distStatus}`, remediation: "See Policy Stuck in Error TSG.", escalation: null, crossReferences: ["policy-stuck-error.md"] });
  }

  // 3. Retention rule
  const retDuration = step2["RetentionDuration"] ?? "";
  const retAction = step2["RetentionComplianceAction"] ?? "";
  if (retDuration && retAction) {
    checks.push({ refNumber: 3, check: "Retention rule", severity: "pass", finding: `RetentionDuration = ${retDuration}, Action = ${retAction}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 3, check: "Retention rule", severity: "warning", finding: "No retention rule details found for this policy.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 4. 16-day async window
  checks.push({ refNumber: 4, check: "Deletion timeline", severity: "info", finding: "Teams deletion can take up to 16 days after retention expires: MFA (7d) + TBA cleanup (7d) + client cache (2d).", remediation: "If within 16-day window, wait before investigating further.", escalation: null, crossReferences: [] });

  // 5. SubstrateHolds content
  if (step3["ItemsInFolder"]) {
    const items = parseInt(step3["ItemsInFolder"], 10);
    checks.push({ refNumber: 5, check: "SubstrateHolds content", severity: items > 0 ? "info" : "pass", finding: `SubstrateHolds folder: ${items} items, size: ${step3["FolderSize"] ?? "N/A"}`, remediation: null, escalation: null, crossReferences: ["substrateholds-quota.md"] });
  } else {
    checks.push({ refNumber: 5, check: "SubstrateHolds content", severity: "pass", finding: "SubstrateHolds folder empty or not found.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 6. Competing holds
  const step4 = parseSingleRecord(step4Raw);
  const litHold = step4Raw.match(/LitigationHoldEnabled\s*:\s*True/);
  const compTagHold = step4Raw.match(/ComplianceTagHoldApplied\s*:\s*True/);
  if (litHold) {
    checks.push({ refNumber: 6, check: "Litigation hold (competing)", severity: "warning", finding: "LitigationHoldEnabled = True \u2014 may prevent Teams message deletion.", remediation: "Remove litigation hold if not required: Set-Mailbox -LitigationHoldEnabled $false.", escalation: null, crossReferences: [] });
  }
  if (compTagHold) {
    checks.push({ refNumber: 6, check: "Compliance tag hold (competing)", severity: "warning", finding: "ComplianceTagHoldApplied = True \u2014 a retention label may prevent deletion.", remediation: "Review and remove the retention label if no longer needed.", escalation: null, crossReferences: [] });
  }
  if (!litHold && !compTagHold) {
    checks.push({ refNumber: 6, check: "Competing holds", severity: "pass", finding: "No litigation hold or compliance tag hold interfering.", remediation: null, escalation: null, crossReferences: [] });
  }

  return checks;
}

// ─── TSG 8: MRM / Purview Conflict ───

function evaluateTsg8(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step2Records = parseFormatList(commands[1]?.output ?? "");
  const step3Records = parseFormatList(commands[2]?.output ?? "");
  const step4Raw = stripAnsi(commands[3]?.output ?? "").trim();

  // 1. MRM policy assigned
  const mrmPolicy = step1["RetentionPolicy"] ?? "";
  if (mrmPolicy) {
    checks.push({ refNumber: 1, check: "MRM policy assigned", severity: "warning", finding: `RetentionPolicy = ${mrmPolicy}. Consider migrating to Purview retention.`, remediation: "If migrated to Purview, remove MRM: Set-Mailbox -RetentionPolicy $null.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "MRM policy assigned", severity: "pass", finding: "No MRM retention policy assigned (clean Purview-only state).", remediation: null, escalation: null, crossReferences: [] });
  }

  // 2. MRM delete tags
  const deleteTags = step2Records.filter((r) => {
    const action = r["RetentionAction"] ?? "";
    return (action === "DeleteAndAllowRecovery" || action === "PermanentlyDelete") && r["RetentionEnabled"] === "True";
  });
  if (deleteTags.length > 0) {
    const tagNames = deleteTags.map((r) => `${r["Name"]} (${r["RetentionAction"]}, ${r["AgeLimitForRetention"] ?? "no limit"})`).join("; ");
    checks.push({ refNumber: 2, check: "MRM delete tags", severity: "warning", finding: `Active MRM delete/purge tags: ${tagNames}`, remediation: "Review for conflict with Purview retain policies. Retention wins over deletion per precedence rules.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "MRM delete tags", severity: "pass", finding: "No active MRM delete/purge tags.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 3. Purview retain policies
  if (step3Records.length > 0) {
    const names = step3Records.map((r) => r["Name"]).filter(Boolean).join(", ");
    checks.push({ refNumber: 3, check: "Purview retain policies", severity: "pass", finding: `Purview policies targeting Exchange: ${names}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 3, check: "Purview retain policies", severity: "warning", finding: "No Purview retention policies targeting all Exchange locations.", remediation: "If MRM delete tags exist without Purview retain safety net, items may be permanently deleted.", escalation: null, crossReferences: ["retention-policy-not-applying.md"] });
  }

  // 4. MRM delete + no Purview retain (dangerous combination)
  if (deleteTags.length > 0 && step3Records.length === 0) {
    checks.push({ refNumber: 4, check: "Unprotected MRM deletion", severity: "error", finding: "MRM delete tags active with NO Purview retain policy \u2014 items may be permanently lost.", remediation: "Apply a Purview retain policy immediately. Recover from Recoverable Items within 14 days.", escalation: null, crossReferences: ["retention-policy-not-applying.md"] });
  } else if (deleteTags.length > 0 && step3Records.length > 0) {
    checks.push({ refNumber: 4, check: "MRM + Purview interaction", severity: "info", finding: "MRM delete tags + Purview retain = expected behavior. Purview retain wins per precedence rules. Items move to RI but are kept.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 5. TracingFAI errors
  if (step4Raw && step4Raw.length > 10) {
    const hasFs = /\"Fs\"\s*:\s*[1-9]/i.test(step4Raw) || /DumpsterQuotaTooSmall|TagUnexpectedActionChanged|FAIUpdateFailed/i.test(step4Raw);
    if (hasFs) {
      checks.push({ refNumber: 5, check: "TracingFAI errors", severity: "error", finding: "TracingFAI errors detected. MRM configuration may be corrupted.", remediation: "Reset: Set-Mailbox -RemoveMRMConfiguration, then Start-ManagedFolderAssistant -Identity <UPN>.", escalation: null, crossReferences: [] });
    } else {
      checks.push({ refNumber: 5, check: "TracingFAI errors", severity: "pass", finding: "TracingFAI data present with no critical errors.", remediation: null, escalation: null, crossReferences: [] });
    }
  } else {
    checks.push({ refNumber: 5, check: "TracingFAI errors", severity: "pass", finding: "No TracingFAI data (normal if MRM hasn't run recently).", remediation: null, escalation: null, crossReferences: [] });
  }

  // 6. Retention precedence reminder
  checks.push({ refNumber: 6, check: "Retention precedence", severity: "info", finding: "Rules: (1) Retain wins over delete. (2) Longest retention wins. (3) Explicit > implicit scope. (4) Shortest delete wins.", remediation: null, escalation: null, crossReferences: [] });

  return checks;
}

// ─── TSG 9: Adaptive Scope ───

function evaluateTsg9(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step2Records = parseFormatList(commands[1]?.output ?? "");
  const step3Raw = stripAnsi(commands[2]?.output ?? "").trim();
  const step4 = parseSingleRecord(commands[3]?.output ?? "");

  // 1. Scope populated
  const scopeName = step1["Name"] ?? "";
  if (scopeName) {
    const locType = step1["LocationType"] ?? "N/A";
    const filterQuery = step1["FilterQuery"] ?? "N/A";
    checks.push({ refNumber: 1, check: "Scope populated", severity: "pass", finding: `Scope: ${scopeName}, LocationType: ${locType}, Filter: ${filterQuery}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "Scope populated", severity: "error", finding: "Adaptive scope not found or returned no data.", remediation: "Verify scope name. Create scope if it doesn't exist.", escalation: null, crossReferences: [] });
  }

  // 2. Scope age
  const whenCreated = step1["WhenCreated"] ?? "";
  if (whenCreated) {
    const ageDays = daysSince(whenCreated);
    if (ageDays !== null && ageDays < 5) {
      checks.push({ refNumber: 2, check: "Scope age \u22655 days", severity: "warning", finding: `Scope created ${ageDays.toFixed(1)} days ago \u2014 population takes up to 5 days.`, remediation: "Wait at least 5 days before assigning scope to a policy.", escalation: null, crossReferences: [] });
    } else if (ageDays !== null) {
      checks.push({ refNumber: 2, check: "Scope age \u22655 days", severity: "pass", finding: `Scope created ${ageDays.toFixed(0)} days ago \u2014 fully populated.`, remediation: null, escalation: null, crossReferences: [] });
    }
  }

  // 3. OPATH validation
  const step2Success = commands[1]?.success ?? false;
  const step2Error = stripAnsi(commands[1]?.output ?? "");
  if (step2Success && step2Records.length > 0) {
    checks.push({ refNumber: 3, check: "OPATH filter validation", severity: "pass", finding: `Filter returned ${step2Records.length} recipient(s).`, remediation: null, escalation: null, crossReferences: [] });
  } else if (step2Error.includes("PS_ERROR") || step2Error.includes("Cannot process") || step2Error.includes("Invalid filter")) {
    checks.push({ refNumber: 3, check: "OPATH filter validation", severity: "error", finding: "OPATH filter syntax error \u2014 filter query is invalid.", remediation: "Fix the FilterQuery. Validate: Get-Recipient -Filter \"<query>\" -ResultSize 1.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 3, check: "OPATH filter validation", severity: "info", finding: "Filter returned no results (may be expected if scope targets specific attributes).", remediation: null, escalation: null, crossReferences: [] });
  }

  // 4. Non-mailbox user inflation
  const countMatches = step3Raw.match(/Count\s*:\s*(\d+)/g);
  if (countMatches && countMatches.length >= 2) {
    const getUserCount = parseInt(countMatches[0].match(/\d+/)![0], 10);
    const getRecipientCount = parseInt(countMatches[1].match(/\d+/)![0], 10);
    if (getUserCount > 0 && getRecipientCount > 0 && getUserCount > getRecipientCount * 1.5) {
      checks.push({ refNumber: 4, check: "Non-mailbox user inflation", severity: "warning", finding: `Get-User returned ${getUserCount} but Get-Recipient (UserMailbox) returned ${getRecipientCount}. ${getUserCount - getRecipientCount} non-mailbox accounts inflating scope.`, remediation: "Add RecipientType -eq 'UserMailbox' to the filter to exclude non-mailbox accounts.", escalation: null, crossReferences: [] });
    } else {
      checks.push({ refNumber: 4, check: "Non-mailbox user inflation", severity: "pass", finding: `Get-User: ${getUserCount}, Get-Recipient (UserMailbox): ${getRecipientCount} \u2014 no significant inflation.`, remediation: null, escalation: null, crossReferences: [] });
    }
  }

  // 5. Associated policy distribution
  const policyName = step4["Name"] ?? "";
  const policyDist = step4["DistributionStatus"] ?? "";
  if (policyName) {
    if (policyDist === "Success") {
      checks.push({ refNumber: 5, check: "Associated policy", severity: "pass", finding: `Policy: ${policyName}, DistributionStatus = Success`, remediation: null, escalation: null, crossReferences: [] });
    } else {
      checks.push({ refNumber: 5, check: "Associated policy", severity: "warning", finding: `Policy: ${policyName}, DistributionStatus = ${policyDist || "Unknown"}`, remediation: "See Policy Stuck in Error TSG for distribution troubleshooting.", escalation: null, crossReferences: ["policy-stuck-error.md"] });
    }
  } else {
    checks.push({ refNumber: 5, check: "Associated policy", severity: "info", finding: "No policies using adaptive scopes found.", remediation: null, escalation: null, crossReferences: [] });
  }

  // 6. Filter query length
  const filterQuery = step1["FilterQuery"] ?? "";
  if (filterQuery.length > 10000) {
    checks.push({ refNumber: 6, check: "Query length", severity: "error", finding: `FilterQuery is ${filterQuery.length} chars (limit: 10,000).`, remediation: "Shorten the query to under 10,000 characters.", escalation: null, crossReferences: [] });
  }

  // 7. Scope WhenChanged
  const whenChanged = step1["WhenChanged"] ?? "";
  if (whenChanged && whenCreated) {
    checks.push({ refNumber: 7, check: "Scope dates", severity: "info", finding: `Created: ${whenCreated}, Last changed: ${whenChanged}`, remediation: null, escalation: null, crossReferences: [] });
  }

  return checks;
}

// ─── TSG 10: Auto-Apply Labels ───

function evaluateTsg10(commands: TsgCommand[]): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = [];
  const step1 = parseSingleRecord(commands[0]?.output ?? "");
  const step2 = parseSingleRecord(commands[1]?.output ?? "");
  const step3Records = parseFormatList(commands[2]?.output ?? "");
  const step4 = parseSingleRecord(commands[3]?.output ?? "");

  // 1. Policy enabled
  const enabled = boolVal(step1, "Enabled");
  if (enabled === true) {
    checks.push({ refNumber: 1, check: "Policy enabled", severity: "pass", finding: "Enabled = True", remediation: null, escalation: null, crossReferences: [] });
  } else if (step1["Name"]) {
    checks.push({ refNumber: 1, check: "Policy enabled", severity: "error", finding: `Enabled = ${step1["Enabled"] ?? "Unknown"} \u2014 policy is not active.`, remediation: "Enable: Set-RetentionCompliancePolicy -Enabled $true.", escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 1, check: "Policy enabled", severity: "error", finding: "Auto-apply policy not found.", remediation: "Verify the policy name. Create one if needed.", escalation: null, crossReferences: [] });
  }

  // 2. Distribution status
  const distStatus = step1["DistributionStatus"] ?? "Unknown";
  if (distStatus === "Success") {
    checks.push({ refNumber: 2, check: "Distribution status", severity: "pass", finding: "DistributionStatus = Success", remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 2, check: "Distribution status", severity: "error", finding: `DistributionStatus = ${distStatus}`, remediation: "Retry: Set-RetentionCompliancePolicy -RetryDistribution. Wait 24\u201348 hrs.", escalation: "If persistent, see Policy Stuck in Error TSG.", crossReferences: ["policy-stuck-error.md"] });
  }

  // 3. Mode (Enforce vs Simulate)
  const mode = step1["Mode"] ?? "";
  if (mode === "Enforce" || mode === "Enable") {
    checks.push({ refNumber: 3, check: "Policy mode", severity: "pass", finding: `Mode = ${mode} (actively labeling content).`, remediation: null, escalation: null, crossReferences: [] });
  } else if (mode === "Simulate" || mode === "TestWithNotifications" || mode === "TestWithoutNotifications") {
    checks.push({ refNumber: 3, check: "Policy mode", severity: "warning", finding: `Mode = ${mode} \u2014 policy is in simulation, not enforcing.`, remediation: "Switch to enforce: Set-RetentionCompliancePolicy -Mode Enable.", escalation: null, crossReferences: [] });
  } else if (mode) {
    checks.push({ refNumber: 3, check: "Policy mode", severity: "warning", finding: `Mode = ${mode}`, remediation: "Investigate non-standard mode.", escalation: null, crossReferences: [] });
  }

  // 4. Matching criteria
  const contentMatch = step2["ContentMatchQuery"] ?? "";
  const sit = step2["ContentContainsSensitiveInformation"] ?? "";
  const hasKQL = contentMatch && !isEmpty(contentMatch);
  const hasSIT = sit && !isEmpty(sit);
  if (hasKQL || hasSIT) {
    const criteria = [hasKQL ? `KQL: ${contentMatch}` : null, hasSIT ? `SIT configured` : null].filter(Boolean).join("; ");
    checks.push({ refNumber: 4, check: "Matching criteria", severity: "pass", finding: criteria!, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 4, check: "Matching criteria", severity: "warning", finding: "No ContentMatchQuery or SIT configured. Policy may not label any content.", remediation: "Add a KQL query, sensitive information type, or trainable classifier.", escalation: null, crossReferences: [] });
  }

  // 5. Label linked
  const publishTag = step2["PublishComplianceTag"] ?? "";
  if (publishTag && !isEmpty(publishTag)) {
    checks.push({ refNumber: 5, check: "Label linked", severity: "pass", finding: `PublishComplianceTag = ${publishTag}`, remediation: null, escalation: null, crossReferences: [] });
  } else {
    checks.push({ refNumber: 5, check: "Label linked", severity: "error", finding: "No retention label linked to the auto-apply rule.", remediation: "Link a retention label to the rule via the Purview portal or PowerShell.", escalation: null, crossReferences: [] });
  }

  // 6. Processing time (7-day ramp-up)
  const whenCreated = step1["WhenCreated"] ?? "";
  if (whenCreated) {
    const ageDays = daysSince(whenCreated);
    if (ageDays !== null && ageDays < 7) {
      checks.push({ refNumber: 6, check: "Processing time", severity: "info", finding: `Policy created ${ageDays.toFixed(1)} days ago. Auto-apply can take up to 7 days to start labeling.`, remediation: "Wait up to 7 days, then re-check.", escalation: null, crossReferences: [] });
    }
  }

  // 7. Auto-apply policy count
  const countMatch = stripAnsi(commands[3]?.output ?? "").match(/Count\s*:\s*(\d+)/);
  if (countMatch) {
    const count = parseInt(countMatch[1], 10);
    if (count >= 10000) {
      checks.push({ refNumber: 7, check: "Policy count limit", severity: "error", finding: `${count} auto-apply policies (limit: 10,000).`, remediation: "Consolidate policies to stay under the 10,000 limit.", escalation: null, crossReferences: [] });
    } else {
      checks.push({ refNumber: 7, check: "Policy count", severity: "pass", finding: `${count} auto-apply policy/policies found.`, remediation: null, escalation: null, crossReferences: [] });
    }
  }

  // 8. Compliance tags summary
  if (step3Records.length > 0) {
    const recordLabels = step3Records.filter((r) => boolVal(r, "IsRecordLabel") === true);
    checks.push({ refNumber: 8, check: "Compliance tags", severity: "info", finding: `${step3Records.length} tag(s) available, ${recordLabels.length} record label(s).`, remediation: null, escalation: null, crossReferences: [] });
  }

  return checks;
}

// ─── Report Renderer ───

export function renderMarkdownReport(results: TsgResult[]): string {
  const lines: string[] = [];
  lines.push("# TSG Diagnostic Report");
  lines.push(`**Run:** ${new Date().toISOString()}`);
  lines.push(`**Tenant:** ${process.env.DLM_ORGANIZATION ?? "unknown"}`);
  lines.push(`**Target mailbox:** ${process.env.DLM_UPN ?? "unknown"}`);
  lines.push("");

  // Executive Summary
  const totalErrors = results.reduce((s, r) => s + r.summary.errors, 0);
  const totalWarnings = results.reduce((s, r) => s + r.summary.warnings, 0);
  const totalInfo = results.reduce((s, r) => s + r.summary.info, 0);
  lines.push("## Executive Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|---|---|");
  lines.push(`| TSGs evaluated | ${results.length} |`);
  lines.push(`| Total errors | ${totalErrors} |`);
  lines.push(`| Total warnings | ${totalWarnings} |`);
  lines.push(`| Total informational | ${totalInfo} |`);
  lines.push("");
  lines.push("| TSG | Status | Errors | Warnings | Result |");
  lines.push("|---|---|---|---|---|");
  for (const r of results) {
    const icon = r.summary.overallStatus === "healthy" ? "\u2705" : r.summary.overallStatus === "warnings" ? "\u26A0\uFE0F" : "\u274C";
    lines.push(`| ${r.tsgNumber}. ${r.tsg} | ${icon} | ${r.summary.errors} | ${r.summary.warnings} | ${r.summary.text} |`);
  }
  lines.push("");

  // Per-TSG Detail
  for (const r of results) {
    lines.push("---");
    lines.push(`## TSG ${r.tsgNumber} \u2014 ${r.tsg}`);
    lines.push(`**Reference:** ${r.reference}`);
    lines.push(`**Result:** ${r.summary.text}`);
    lines.push("");

    // Data Collection
    lines.push("### Data Collection");
    lines.push("| Step | Command | Status | Duration |");
    lines.push("|---|---|---|---|");
    for (const cmd of r.commands) {
      const status = cmd.success ? "\u2705" : "\u274C";
      const duration = `${(cmd.durationMs / 1000).toFixed(1)}s`;
      const cmdText = cmd.command.length > 80 ? cmd.command.substring(0, 77) + "..." : cmd.command;
      lines.push(`| ${cmd.step} | \`${cmdText}\` | ${status} | ${duration} |`);
    }
    lines.push("");

    // Diagnostic Analysis
    if (r.diagnostics.length > 0) {
      lines.push("### Diagnostic Analysis");
      lines.push("| # | Check | Status | Finding |");
      lines.push("|---|---|---|---|");
      for (const d of r.diagnostics) {
        const icon = SEVERITY_ICON[d.severity];
        lines.push(`| ${d.refNumber} | ${d.check} | ${icon} | ${d.finding} |`);
      }
      lines.push("");

      // Remediation
      const actionable = r.diagnostics.filter((d) => d.severity !== "pass" && d.severity !== "info" && d.remediation);
      if (actionable.length > 0) {
        lines.push("### Remediation");
        for (const d of actionable) {
          const icon = SEVERITY_ICON[d.severity];
          lines.push(`- **${d.check}** (${icon}): ${d.remediation}`);
          if (d.escalation) {
            lines.push(`  - *Escalation:* ${d.escalation}`);
          }
        }
        lines.push("");
      }

      // Cross-References
      const allRefs = [...new Set(r.diagnostics.flatMap((d) => d.crossReferences))];
      if (allRefs.length > 0) {
        lines.push("### Related TSGs");
        for (const ref of allRefs) {
          lines.push(`- ${ref}`);
        }
        lines.push("");
      }
    }
  }

  return lines.join("\n");
}
