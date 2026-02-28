// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PsExecutor } from "./powershell/executor.js";
import { ExecutionLog } from "./logger.js";
import { ALLOWED_CMDLETS } from "./powershell/allowlist.js";
import { lookupTopic, formatTopicResponse } from "./asklearn.js";

// ── Main ──
async function main(): Promise<void> {
  const executor = new PsExecutor();
  const log = new ExecutionLog();

  const server = new McpServer({
    name: "dlm-diagnostics",
    version: "2.0.0",
  });

  // ── Tool 1: run_powershell ──
  server.tool(
    "run_powershell",
    "Execute a read-only PowerShell command against Exchange Online and Security & Compliance sessions. " +
      "Only allowlisted cmdlets are permitted: " +
      [...ALLOWED_CMDLETS].join(", ") +
      ". Pipeline/formatting cmdlets (Select-Object, Where-Object, ForEach-Object, ConvertTo-Json, etc.) are also allowed. " +
      "All Set-*, New-*, Remove-*, Enable-*, Start-*, Invoke-* cmdlets are BLOCKED. " +
      "Every command and its result are logged for the session. " +
      "Returns JSON with { success, output, error?, durationMs }.",
    { command: z.string().describe("The PowerShell command to execute.") },
    async (input) => {
      const start = Date.now();
      const result = await executor.execute(input.command);
      const durationMs = Date.now() - start;

      log.append({
        timestamp: new Date().toISOString(),
        command: input.command,
        success: result.success,
        output: result.output,
        error: result.error,
        durationMs,
      });

      const response = {
        success: result.success,
        output: result.output,
        error: result.error ?? null,
        durationMs,
        logIndex: log.count(),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(response, null, 2) }],
        isError: !result.success,
      };
    },
  );

  // ── Tool 2: get_execution_log ──
  server.tool(
    "get_execution_log",
    "Retrieve the full execution log of all PowerShell commands run during this session. " +
      "Returns a Markdown-formatted log with timestamps, commands, outputs, errors, and durations. " +
      "Useful for reviewing the diagnostic trail, auditing, or summarizing an investigation.",
    {},
    async () => {
      return {
        content: [{ type: "text" as const, text: log.toMarkdown() }],
      };
    },
  );

  // ── Tool 3: ask_learn ──
  server.tool(
    "ask_learn",
    "Look up Microsoft Purview documentation on Microsoft Learn. " +
      "Use this tool when the user's question is about 'how to' configure, set up, or understand a Purview feature " +
      "and does NOT match a diagnostic symptom handled by run_powershell. " +
      "Covers: retention policies, retention labels, archive mailboxes, inactive mailboxes, eDiscovery, " +
      "audit log, communication compliance, information barriers, insider risk management, records management, " +
      "and adaptive scopes. Returns relevant Microsoft Learn links and step-by-step guidance.",
    { question: z.string().describe("The user's question or topic to look up.") },
    async (input) => {
      const matches = lookupTopic(input.question);
      const response = formatTopicResponse(matches);
      return {
        content: [{ type: "text" as const, text: response }],
      };
    },
  );

  // Connect MCP transport FIRST so the server can respond to `initialize`
  process.stderr.write("[DLM Diagnostics MCP] Starting…\n");
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[DLM Diagnostics MCP] Server running ✓\n");

  // Initialize PowerShell sessions in the background
  // (tools return a helpful error if sessions aren't ready yet)
  executor.init().catch((err) => {
    process.stderr.write(`[DLM Diagnostics MCP] Failed to initialize PowerShell sessions: ${err}\n`);
    process.stderr.write("[DLM Diagnostics MCP] Commands will fail until sessions connect.\n");
  });

  // Graceful shutdown
  process.on("SIGINT", async () => {
    await executor.shutdown();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await executor.shutdown();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`[DLM Diagnostics MCP] Fatal: ${err}\n`);
  process.exit(1);
});
