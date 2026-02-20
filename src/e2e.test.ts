// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from "vitest";
import { getSharedClient } from "./test-setup.js";

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

// ─── Helpers ───

function parseToolResult(result: CallToolResult): ToolResult {
  const text = (result.content as Array<{ type: string; text: string }>)[0]
    .text;
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

// ─── Group 1: Server Discovery ───

describe("Server Discovery", () => {
  it("lists exactly 2 tools", async () => {
    const { tools } = await getSharedClient().listTools();
    expect(tools).toHaveLength(2);
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(["get_execution_log", "run_powershell"]);
  });

  it("run_powershell has correct input schema", async () => {
    const { tools } = await getSharedClient().listTools();
    const runPs = tools.find((t) => t.name === "run_powershell")!;
    expect(runPs.inputSchema.type).toBe("object");
    expect(runPs.inputSchema.properties).toHaveProperty("command");
    expect(runPs.inputSchema.required).toContain("command");
  });

  it("get_execution_log has no required params", async () => {
    const { tools } = await getSharedClient().listTools();
    const getLog = tools.find((t) => t.name === "get_execution_log")!;
    const required = getLog.inputSchema.required ?? [];
    expect(required).toHaveLength(0);
  });
});

// ─── Group 2: Allowlist Enforcement ───

describe("Allowlist Enforcement", () => {
  it("blocks Set-Mailbox", async () => {
    const result = await runCommand("Set-Mailbox -Identity test");
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Set-");
  });

  it("blocks Remove-RetentionCompliancePolicy", async () => {
    const result = await runCommand(
      'Remove-RetentionCompliancePolicy -Identity "test"',
    );
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Remove-");
  });

  it("blocks New-RetentionComplianceRule", async () => {
    const result = await runCommand(
      'New-RetentionComplianceRule -Policy "test"',
    );
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("New-");
  });

  it("blocks Start-ManagedFolderAssistant", async () => {
    const result = await runCommand(
      "Start-ManagedFolderAssistant -Identity test",
    );
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Start-");
  });

  it("blocks Invoke-WebRequest", async () => {
    const result = await runCommand(
      "Invoke-WebRequest -Uri https://example.com",
    );
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Invoke-");
  });

  it("blocks unknown cmdlet Get-FooBaz", async () => {
    const result = await runCommand("Get-FooBaz");
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("not in the allowlist");
  });

  it("blocks pipeline with one blocked cmdlet", async () => {
    const result = await runCommand("Get-Mailbox | Set-Mailbox -Name test");
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain("Set-");
  });
});

// ─── Group 3: Security & Compliance Cmdlets ───

describe("Security & Compliance Cmdlets", () => {
  it("Get-RetentionCompliancePolicy returns data", async () => {
    const output = await runAndExpectSuccess(
      "Get-RetentionCompliancePolicy | Select-Object -First 1 Name, DistributionStatus",
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("Get-RetentionComplianceRule returns data", async () => {
    // First get a policy name to query rules for
    const policyOutput = await runAndExpectSuccess(
      "Get-RetentionCompliancePolicy | Select-Object -First 1 Name | ConvertTo-Json",
    );
    let policyName: string;
    try {
      policyName = JSON.parse(policyOutput).Name;
    } catch {
      policyName = "Default";
    }
    const output = await runAndExpectSuccess(
      `Get-RetentionComplianceRule -Policy "${policyName}" | FL Name`,
    );
    expect(typeof output).toBe("string");
  });

  it("Get-AdaptiveScope executes successfully", async () => {
    // May be empty if no scopes exist — that's not an error
    await runAndExpectSuccess(
      "Get-AdaptiveScope | Select-Object -First 1 Name, LocationType",
    );
  });

  it("Get-ComplianceTag executes successfully", async () => {
    await runAndExpectSuccess(
      "Get-ComplianceTag | Select-Object -First 1 Name, RetentionDuration",
    );
  });
});

// ─── Group 4: Exchange Online Cmdlets ───

describe("Exchange Online Cmdlets", () => {
  it("Get-Mailbox returns mailbox data", async () => {
    const output = await runAndExpectSuccess(
      "Get-Mailbox -ResultSize 1 | FL DisplayName, UserPrincipalName",
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("Get-Recipient returns data", async () => {
    const output = await runAndExpectSuccess(
      "Get-Recipient -ResultSize 1 | FL Name, RecipientType",
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("Get-User returns data", async () => {
    const output = await runAndExpectSuccess(
      "Get-User -ResultSize 1 | FL Name, RecipientTypeDetails",
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("Get-OrganizationConfig returns data", async () => {
    const output = await runAndExpectSuccess(
      "Get-OrganizationConfig | FL AutoExpandingArchiveEnabled",
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("Get-MailboxStatistics returns data", async () => {
    const upn = process.env.DLM_UPN!;
    const output = await runAndExpectSuccess(
      `Get-MailboxStatistics ${upn} | FL TotalItemSize`,
    );
    expect(output.length).toBeGreaterThan(0);
  });

  it("Get-UnifiedGroup executes successfully", async () => {
    // May be empty if no groups exist
    await runAndExpectSuccess(
      "Get-UnifiedGroup -ResultSize 1 | FL DisplayName",
    );
  });
});

// ─── Group 5: Complex Pipelines & Safe Builtins ───

describe("Complex Pipelines & Safe Builtins", () => {
  it("Pipeline with Where-Object", async () => {
    await runAndExpectSuccess(
      'Get-RetentionCompliancePolicy | Where-Object {$_.Enabled -eq $true} | Measure-Object',
    );
  });

  it("Pipeline with Format-List", async () => {
    await runAndExpectSuccess(
      "Get-Mailbox -ResultSize 1 | Format-List DisplayName",
    );
  });

  it("ConvertTo-Json produces valid JSON", async () => {
    const output = await runAndExpectSuccess(
      "Get-OrganizationConfig | Select-Object AutoExpandingArchiveEnabled | ConvertTo-Json",
    );
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it("Multi-pipe chain executes successfully", async () => {
    await runAndExpectSuccess(
      "Get-RetentionCompliancePolicy | Select-Object Name, Enabled | Sort-Object Name | ConvertTo-Json",
    );
  });
});

// ─── Group 6: Response Structure Validation ───

describe("Response Structure Validation", () => {
  it("successful command has correct response shape", async () => {
    const result = await runCommand(
      "Get-OrganizationConfig | FL AutoExpandingArchiveEnabled",
    );
    expect(result.isError).toBeFalsy();
    const parsed = parseToolResult(result);
    expect(typeof parsed.success).toBe("boolean");
    expect(parsed.success).toBe(true);
    expect(typeof parsed.output).toBe("string");
    expect(parsed.error).toBeNull();
    expect(typeof parsed.durationMs).toBe("number");
    expect(parsed.durationMs).toBeGreaterThan(0);
    expect(typeof parsed.logIndex).toBe("number");
    expect(parsed.logIndex).toBeGreaterThanOrEqual(1);
  });

  it("failed command has correct response shape", async () => {
    const result = await runCommand("Set-Mailbox -Identity test");
    expect(result.isError).toBe(true);
    const parsed = parseToolResult(result);
    expect(parsed.success).toBe(false);
    expect(typeof parsed.error).toBe("string");
    expect(parsed.error!.length).toBeGreaterThan(0);
  });

  it("logIndex increments with each command", async () => {
    // Run two commands and check logIndex increases
    const result1 = await runCommand(
      "Get-OrganizationConfig | FL AutoExpandingArchiveEnabled",
    );
    const parsed1 = parseToolResult(result1);

    const result2 = await runCommand(
      "Get-OrganizationConfig | FL AutoExpandingArchiveEnabled",
    );
    const parsed2 = parseToolResult(result2);

    expect(parsed2.logIndex).toBe(parsed1.logIndex + 1);
  });
});

// ─── Group 7: Execution Log ───

describe("Execution Log", () => {
  it("log returns markdown", async () => {
    const result = (await getSharedClient().callTool({
      name: "get_execution_log",
      arguments: {},
    })) as CallToolResult;
    const text = result.content[0].text;
    expect(text).toContain("# Execution Log");
  });

  it("log includes all commands run so far", async () => {
    const result = (await getSharedClient().callTool({
      name: "get_execution_log",
      arguments: {},
    })) as CallToolResult;
    const text = result.content[0].text;
    expect(text).toContain("Total commands:");
    // Extract the count from "**Total commands:** N"
    const match = text.match(/Total commands:\*\*\s+(\d+)/);
    expect(match).not.toBeNull();
    const count = parseInt(match![1], 10);
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it("log shows failures with ❌", async () => {
    // We already ran blocked commands in earlier tests
    const result = (await getSharedClient().callTool({
      name: "get_execution_log",
      arguments: {},
    })) as CallToolResult;
    const text = result.content[0].text;
    expect(text).toContain("❌");
  });
});
