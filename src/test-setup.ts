// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// ─── Shared MCP Server Session ───
// Single server instance shared across all test files.
// Avoids MSAL token acquisition hanging on the second server spawn.

import { beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let _client: Client | null = null;
let _transport: StdioClientTransport | null = null;
let _ready = false;

interface CallToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export function getSharedClient(): Client {
  if (!_client) throw new Error("Shared MCP client not initialized");
  return _client;
}

export function isServerReady(): boolean {
  return _ready;
}

beforeAll(async () => {
  _transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    cwd: process.cwd(),
    stderr: "pipe",
    env: { ...process.env } as Record<string, string>,
  });

  // Drain stderr to prevent pipe buffer blocking on Windows
  _transport.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[mcp-server] ${chunk.toString()}`);
  });

  _client = new Client(
    { name: "shared-test", version: "1.0.0" },
    { capabilities: {} },
  );
  await _client.connect(_transport);

  // Wait for PowerShell session to be initialized
  const maxWaitMs = 270_000;
  const pollMs = 3_000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const probe = (await _client.callTool(
      { name: "run_powershell", arguments: { command: "Write-Host 'ready'" } },
      undefined,
      { timeout: 180_000 },
    )) as CallToolResult;
    const parsed = JSON.parse(probe.content[0].text);
    if (parsed.success) {
      _ready = true;
      break;
    }
    if (!parsed.error?.includes("not initialized")) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
});

afterAll(async () => {
  if (_transport) {
    await _transport.close();
    _transport = null;
    _client = null;
    _ready = false;
  }
});
