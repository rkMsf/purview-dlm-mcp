// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { getSharedClient } from "./test-setup.js";
import {
  evaluateTsg,
  computeSummary,
  renderMarkdownReport,
  type TsgCommand,
  type TsgResult,
} from "./tsg-diagnostics.js";

// ─── Types ───

interface ToolResult {
  success: boolean;
  output: string;
  error: string | null;
  durationMs: number;
  logIndex: number;
}

interface CallToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// ─── Discovered Test Data ───

let testPolicy: string;
let testAutoApply: string;
let testUPN: string;
let testScope: string;
let testScopeFilter: string;

// ─── Results Collection ───

const allResults: TsgResult[] = [];

// ─── Helpers ───

function parseToolResult(result: CallToolResult): ToolResult {
  const text = result.content[0].text;
  return JSON.parse(text);
}

async function runCommand(command: string): Promise<CallToolResult> {
  return (await getSharedClient().callTool(
    { name: "run_powershell", arguments: { command } },
    undefined,
    { timeout: 180_000 },
  )) as CallToolResult;
}

async function runAndExpectSuccess(command: string): Promise<string> {
  const result = await runCommand(command);
  const parsed = parseToolResult(result);
  expect(parsed.success).toBe(true);
  return parsed.output;
}

function tryParseJson<T = any>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function runTsgStep(
  step: string,
  command: string,
  commands: TsgCommand[],
): Promise<string> {
  const result = await runCommand(command);
  const parsed = parseToolResult(result);
  commands.push({
    step,
    command,
    success: parsed.success,
    output: parsed.output,
    durationMs: parsed.durationMs,
  });
  expect(parsed.success).toBe(true);
  return parsed.output;
}

function pushResult(
  tsgNumber: number,
  tsg: string,
  reference: string,
  commands: TsgCommand[],
): void {
  const diagnostics = evaluateTsg(tsgNumber, commands);
  const summary = computeSummary(diagnostics);
  allResults.push({
    tsg,
    tsgNumber,
    reference,
    timestamp: new Date().toISOString(),
    commands,
    diagnostics,
    summary,
  });
}

// ─── Setup & Teardown ───

beforeAll(async () => {
  // Server is started by shared test-setup.ts — just do data discovery here
  testUPN = process.env.DLM_UPN!;

  // Discover a retention policy
  const policies = await runAndExpectSuccess(
    "Get-RetentionCompliancePolicy | Select-Object -First 1 Name | ConvertTo-Json",
  );
  testPolicy = tryParseJson<{ Name: string }>(policies)?.Name ?? "TestPolicy";

  // Discover an auto-apply policy
  const autoApply = await runAndExpectSuccess(
    'Get-RetentionCompliancePolicy | Where-Object {$_.Type -eq "ApplyTag"} | Select-Object -First 1 Name | ConvertTo-Json',
  );
  testAutoApply =
    tryParseJson<{ Name: string }>(autoApply)?.Name ?? "TestAutoApplyPolicy";

  // Discover an adaptive scope
  const scopes = await runAndExpectSuccess(
    "Get-AdaptiveScope | Select-Object -First 1 Name, FilterQuery | ConvertTo-Json",
  );
  const scopeData = tryParseJson<{ Name: string; FilterQuery: string }>(scopes);
  testScope = scopeData?.Name ?? "TestScope";
  testScopeFilter = scopeData?.FilterQuery ?? "Department -eq ''Test''";
});

afterAll(async () => {
  mkdirSync("test-results", { recursive: true });
  writeFileSync(
    "test-results/tsg-report.json",
    JSON.stringify(allResults, null, 2),
  );
  writeFileSync("test-results/tsg-report.md", renderMarkdownReport(allResults));
});

// ─── TSG 1: Retention Policy Not Applying ───

describe("TSG: Retention Policy Not Applying", () => {
  const commands: TsgCommand[] = [];

  it("1.1 Policy status & distribution", async () => {
    await runTsgStep("1.1", `Get-RetentionCompliancePolicy "${testPolicy}" | FL Name, Enabled, Mode, DistributionStatus`, commands);
  });

  it("1.2 Distribution detail", async () => {
    await runTsgStep("1.2", `Get-RetentionCompliancePolicy "${testPolicy}" -DistributionDetail | FL DistributionDetail`, commands);
  });

  it("1.3 Retention rule exists", async () => {
    await runTsgStep("1.3", `Get-RetentionComplianceRule -Policy "${testPolicy}" | FL Name, RetentionDuration, RetentionComplianceAction`, commands);
  });

  it("1.4 Policy scope (all workloads)", async () => {
    await runTsgStep("1.4", `Get-RetentionCompliancePolicy "${testPolicy}" | FL ExchangeLocation, SharePointLocation, OneDriveLocation, TeamsChannelLocation, AdaptiveScopeLocation`, commands);
  });

  it("1.5 Hold stamp on mailbox", async () => {
    await runTsgStep("1.5", `Get-Mailbox ${testUPN} | FL InPlaceHolds, RetentionPolicy, LitigationHoldEnabled`, commands);
    pushResult(1, "Retention Policy Not Applying", "retention-policy-not-applying.md", commands);
  });
});

// ─── TSG 2: Policy Stuck in Error ───

describe("TSG: Policy Stuck in Error", () => {
  const commands: TsgCommand[] = [];

  it("2.1 Policy status & distribution detail", async () => {
    await runTsgStep("2.1", `Get-RetentionCompliancePolicy "${testPolicy}" | FL Name, Guid, DistributionStatus, Enabled, WhenChanged`, commands);
  });

  it("2.2 Policy mode & type", async () => {
    await runTsgStep("2.2", `Get-RetentionCompliancePolicy "${testPolicy}" | FL Mode, Type, WhenCreated, WhenChanged`, commands);
  });

  it("2.3 Workload-specific locations + adaptive scope", async () => {
    await runTsgStep("2.3", `Get-RetentionCompliancePolicy "${testPolicy}" | FL ExchangeLocation, SharePointLocation, TeamsChannelLocation, AdaptiveScopeLocation`, commands);
  });

  it("2.4 Duplicate object check", async () => {
    await runTsgStep("2.4", `Get-Recipient -Filter "EmailAddresses -eq 'smtp:${testUPN}'" | FL Name, RecipientType, Guid`, commands);
    pushResult(2, "Policy Stuck in Error", "policy-stuck-error.md", commands);
  });
});

// ─── TSG 3: Items Not Moving to Archive ───

describe("TSG: Items Not Moving to Archive", () => {
  const commands: TsgCommand[] = [];

  it("3.1 Mailbox & archive config", async () => {
    await runTsgStep("3.1", `Get-Mailbox ${testUPN} | FL ArchiveStatus, ArchiveGuid, RetentionPolicy, RetentionHoldEnabled, ElcProcessingDisabled, AccountDisabled, IsShared`, commands);
  });

  it("3.2 MRM retention policy tags", async () => {
    await runTsgStep("3.2", 'Get-RetentionPolicyTag | Where-Object {$_.RetentionAction -eq "MoveToArchive"} | FL Name, Type, AgeLimitForRetention, RetentionEnabled', commands);
  });

  it("3.3 License validation", async () => {
    await runTsgStep("3.3", `Get-MailboxPlan (Get-Mailbox ${testUPN}).MailboxPlan | Select-Object -ExpandProperty PersistedCapabilities`, commands);
  });

  it("3.4 Org-level ELC", async () => {
    await runTsgStep("3.4", "Get-OrganizationConfig | FL ElcProcessingDisabled", commands);
  });

  it("3.5 ELC last success timestamp", async () => {
    await runTsgStep("3.5", `$logs = Export-MailboxDiagnosticLogs ${testUPN} -ExtendedProperties; ([xml]$logs.MailboxLog).Properties.MailboxTable.Property | Where-Object {$_.Name -eq "ELCLastSuccessTimestamp"}`, commands);
  });

  it("3.6 Active move requests", async () => {
    await runTsgStep("3.6", `Get-MoveRequest ${testUPN} -ErrorAction SilentlyContinue | FL Status, PercentComplete`, commands);
    pushResult(3, "Items Not Moving to Archive", "items-not-moving-to-archive.md", commands);
  });
});

// ─── TSG 4: Auto-Expanding Archive ───

describe("TSG: Auto-Expanding Archive", () => {
  const commands: TsgCommand[] = [];

  it("4.1 Org auto-expanding config", async () => {
    await runTsgStep("4.1", "Get-OrganizationConfig | FL AutoExpandingArchiveEnabled", commands);
  });

  it("4.2 User archive config", async () => {
    await runTsgStep("4.2", `Get-Mailbox ${testUPN} | FL AutoExpandingArchiveEnabled, ArchiveStatus, ArchiveState, ArchiveGuid, ArchiveQuota, LitigationHoldEnabled`, commands);
  });

  it("4.3 Archive size", async () => {
    await runTsgStep("4.3", `Get-MailboxStatistics ${testUPN} -Archive | FL TotalItemSize, TotalDeletedItemSize`, commands);
  });

  it("4.4 Mailbox locations (aux archives)", async () => {
    await runTsgStep("4.4", `Get-Mailbox ${testUPN} | Select-Object -ExpandProperty MailboxLocations`, commands);
  });

  it("4.5 Archive connectivity", async () => {
    await runTsgStep("4.5", `Test-ArchiveConnectivity ${testUPN} -IncludeArchiveMRMConfiguration | Select-Object -ExpandProperty Result`, commands);
    pushResult(4, "Auto-Expanding Archive", "auto-expanding-archive.md", commands);
  });
});

// ─── TSG 5: Inactive Mailbox ───

describe("TSG: Inactive Mailbox", () => {
  const commands: TsgCommand[] = [];

  it("5.1 Inactive mailbox enumeration", async () => {
    await runTsgStep("5.1", "Get-Mailbox -InactiveMailboxOnly -ResultSize 5 | FL UserPrincipalName, IsInactiveMailbox, InPlaceHolds, LitigationHoldEnabled", commands);
  });

  it("5.2 Soft-deleted mailbox enumeration", async () => {
    await runTsgStep("5.2", "Get-Mailbox -SoftDeletedMailbox -ResultSize 5 | FL UserPrincipalName, WhenSoftDeleted, InPlaceHolds", commands);
  });

  it("5.3 Retention policies covering Exchange", async () => {
    await runTsgStep("5.3", 'Get-RetentionCompliancePolicy | Where-Object {$_.ExchangeLocation -eq "All"} | FL Name, Enabled, Mode', commands);
    pushResult(5, "Inactive Mailbox", "inactive-mailbox.md", commands);
  });
});

// ─── TSG 6: SubstrateHolds / RI Quota ───

describe("TSG: SubstrateHolds / RI Quota", () => {
  const commands: TsgCommand[] = [];

  it("6.1 Recoverable Items stats", async () => {
    await runTsgStep("6.1", `Get-MailboxFolderStatistics ${testUPN} -FolderScope RecoverableItems | FL Name, FolderSize, ItemsInFolder, FolderPath`, commands);
  });

  it("6.2 All holds on mailbox", async () => {
    await runTsgStep("6.2", `Get-Mailbox ${testUPN} | FL InPlaceHolds, LitigationHoldEnabled, LitigationHoldDuration, ComplianceTagHoldApplied, DelayHoldApplied, DelayReleaseHoldApplied, RetentionHoldEnabled`, commands);
  });

  it("6.3 Org-level holds", async () => {
    await runTsgStep("6.3", "(Get-OrganizationConfig).InPlaceHolds", commands);
  });

  it("6.4 Dumpster expiration check", async () => {
    await runTsgStep("6.4", `$logs = Export-MailboxDiagnosticLogs ${testUPN} -ExtendedProperties; ([xml]$logs.MailboxLog).Properties.MailboxTable.Property | Where-Object {$_.Name -eq "DumpsterExpirationLastSuccessRunTimestamp"}`, commands);
  });

  it("6.5 Quota utilization", async () => {
    await runTsgStep("6.5", `$mbx = Get-Mailbox ${testUPN}; $stats = Get-MailboxStatistics ${testUPN}; Write-Host "TotalItemSize: $($stats.TotalItemSize) / ProhibitSendReceiveQuota: $($mbx.ProhibitSendReceiveQuota)"; Write-Host "TotalDeletedItemSize: $($stats.TotalDeletedItemSize) / RecoverableItemsQuota: $($mbx.RecoverableItemsQuota)"`, commands);
    pushResult(6, "SubstrateHolds / RI Quota", "substrateholds-quota.md", commands);
  });
});

// ─── TSG 7: Teams Messages Not Deleting ───

describe("TSG: Teams Messages Not Deleting", () => {
  const commands: TsgCommand[] = [];

  it("7.1 Teams policy config", async () => {
    await runTsgStep("7.1", `Get-RetentionCompliancePolicy "${testPolicy}" | FL TeamsChannelLocation, TeamsChatLocation, Enabled, DistributionStatus`, commands);
  });

  it("7.2 Teams rule", async () => {
    await runTsgStep("7.2", `Get-RetentionComplianceRule -Policy "${testPolicy}" | FL RetentionDuration, RetentionComplianceAction`, commands);
  });

  it("7.3 SubstrateHolds content", async () => {
    await runTsgStep("7.3", `Get-MailboxFolderStatistics ${testUPN} -FolderScope RecoverableItems | Where-Object {$_.Name -eq "SubstrateHolds"} | FL FolderSize, ItemsInFolder`, commands);
  });

  it("7.4 Holds + group mailbox", async () => {
    await runTsgStep("7.4", `Get-Mailbox ${testUPN} | FL InPlaceHolds, LitigationHoldEnabled, ComplianceTagHoldApplied; Get-Mailbox -GroupMailbox -ResultSize 5 | FL DisplayName, InPlaceHolds`, commands);
    pushResult(7, "Teams Messages Not Deleting", "teams-messages-not-deleting.md", commands);
  });
});

// ─── TSG 8: MRM / Purview Conflict ───

describe("TSG: MRM / Purview Conflict", () => {
  const commands: TsgCommand[] = [];

  it("8.1 All retention mechanisms", async () => {
    await runTsgStep("8.1", `Get-Mailbox ${testUPN} | FL RetentionPolicy, RetentionHoldEnabled, InPlaceHolds, LitigationHoldEnabled, ComplianceTagHoldApplied`, commands);
  });

  it("8.2 MRM tags and actions", async () => {
    await runTsgStep("8.2", 'Get-RetentionPolicyTag | Where-Object {$_.RetentionAction -ne "MoveToArchive"} | FL Name, Type, AgeLimitForRetention, RetentionAction, RetentionEnabled', commands);
  });

  it("8.3 Purview policies affecting mailbox", async () => {
    await runTsgStep("8.3", 'Get-RetentionCompliancePolicy | Where-Object {$_.ExchangeLocation -eq "All"} | FL Name, Guid', commands);
  });

  it("8.4 TracingFAI errors", async () => {
    await runTsgStep("8.4", `(Export-MailboxDiagnosticLogs ${testUPN} -ComponentName TracingFai).MailboxLog | ConvertFrom-Json`, commands);
    pushResult(8, "MRM / Purview Conflict", "mrm-purview-conflict.md", commands);
  });
});

// ─── TSG 9: Adaptive Scope ───

describe("TSG: Adaptive Scope", () => {
  const commands: TsgCommand[] = [];

  it("9.1 Scope config & age", async () => {
    await runTsgStep("9.1", `Get-AdaptiveScope "${testScope}" | FL Name, LocationType, FilterQuery, WhenCreated, WhenChanged`, commands);
  });

  it("9.2 OPATH validation", async () => {
    await runTsgStep("9.2", `Get-Recipient -Filter "${testScopeFilter}" -ResultSize 10 | FL Name, RecipientType, RecipientTypeDetails`, commands);
  });

  it("9.3 Non-mailbox user inflation", async () => {
    await runTsgStep("9.3", `Get-User -Filter "${testScopeFilter}" -ResultSize 10 | Measure-Object; Get-Recipient -RecipientTypeDetails UserMailbox -Filter "${testScopeFilter}" -ResultSize 10 | Measure-Object`, commands);
  });

  it("9.4 Associated policy", async () => {
    await runTsgStep("9.4", "Get-RetentionCompliancePolicy | Where-Object {$_.AdaptiveScopeLocation -ne $null} | Select-Object -First 1 Name, DistributionStatus, AdaptiveScopeLocation | FL", commands);
    pushResult(9, "Adaptive Scope", "adaptive-scope.md", commands);
  });
});

// ─── TSG 10: Auto-Apply Labels ───

describe("TSG: Auto-Apply Labels", () => {
  const commands: TsgCommand[] = [];

  it("10.1 Auto-apply policy status", async () => {
    await runTsgStep("10.1", `Get-RetentionCompliancePolicy "${testAutoApply}" | FL Name, Guid, Enabled, Mode, Type, DistributionStatus, WhenCreated`, commands);
  });

  it("10.2 Auto-apply rule config", async () => {
    await runTsgStep("10.2", `Get-RetentionComplianceRule -Policy "${testAutoApply}" | FL Name, ContentMatchQuery, ContentContainsSensitiveInformation, PublishComplianceTag, RetentionDuration, Mode`, commands);
  });

  it("10.3 All compliance tags", async () => {
    await runTsgStep("10.3", "Get-ComplianceTag | FL Name, Guid, RetentionDuration, RetentionAction, IsRecordLabel", commands);
  });

  it("10.4 Auto-apply policy count", async () => {
    await runTsgStep("10.4", 'Get-RetentionCompliancePolicy | Where-Object {$_.Type -eq "ApplyTag"} | Measure-Object', commands);
    pushResult(10, "Auto-Apply Labels", "auto-apply-labels.md", commands);
  });
});
