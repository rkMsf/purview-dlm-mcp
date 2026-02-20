// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { validateCommand } from "./allowlist.js";

// ─── Types ───

export interface PsResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface PsJsonResult<T = any> {
  success: boolean;
  data?: T;
  raw: string;
  error?: string;
}

// ─── Executor ───

/**
 * Manages a single long-lived PowerShell 7 (pwsh) process.
 * On init it acquires an access token via MSAL interactive browser auth
 * (in a separate short-lived pwsh process), then uses that token to
 * connect to Exchange Online and IPPSSession in the main piped process.
 */
export class PsExecutor {
  private proc: ChildProcess | null = null;
  private buf = "";
  private ready = false;

  /* ───────── Lifecycle ───────── */

  async init(): Promise<void> {
    this.proc = spawn("pwsh", ["-NoExit", "-NoProfile", "-Command", "-"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      env: { ...process.env },
    });

    // Accumulate stdout for marker-based I/O
    this.proc.stdout!.on("data", (d: Buffer) => {
      this.buf += d.toString();
    });
    // Forward stderr to MCP host
    this.proc.stderr!.on("data", (d: Buffer) => {
      process.stderr.write(d);
    });
    this.proc.on("exit", (code) => {
      process.stderr.write(`[PsExecutor] pwsh exited (code ${code})\n`);
      this.ready = false;
    });

    await this.waitForMarker(); // ensure process is responsive

    // Suppress progress bars — they don't render in piped mode and can block stdout
    await this.execRaw("$ProgressPreference = 'SilentlyContinue'", 5_000);

    const upn = process.env.DLM_UPN;
    const org = process.env.DLM_ORGANIZATION;
    if (!upn || !org) {
      throw new Error("Environment variables DLM_UPN and DLM_ORGANIZATION are required.");
    }

    // ── Step 0: Pre-import ExchangeOnlineManagement module ──
    // This MUST happen before Connect-ExchangeOnline. In a piped process the
    // auto-import triggered by Connect-ExchangeOnline can hang indefinitely.
    // Explicitly importing first avoids the hang.
    process.stderr.write("[PsExecutor] Importing ExchangeOnlineManagement module…\n");
    await this.execRaw(
      "Import-Module ExchangeOnlineManagement -ErrorAction Stop",
      30_000,
    );
    process.stderr.write("[PsExecutor] Module imported ✓\n");

    // ── Step 1: Acquire access token via MSAL interactive browser ──
    // Spawns a separate short-lived pwsh process that opens the system browser.
    // The piped main process can't do interactive auth (no console/TTY).
    process.stderr.write("[PsExecutor] Acquiring access token (browser will open)…\n");
    const token = await this.acquireAccessToken(
      "https://outlook.office365.com/.default",
      upn,
      org,
      300_000,
    );

    // ── Step 2: Connect Exchange Online with the token ──
    process.stderr.write("[PsExecutor] Connecting to Exchange Online…\n");
    await this.execRaw(
      `Connect-ExchangeOnline -AccessToken '${token}' ` +
        `-Organization '${this.escape(org)}' -ShowBanner:$false`,
      120_000,
    );

    // ── Step 3: Connect IPPSSession with the same token ──
    process.stderr.write("[PsExecutor] Connecting to Security & Compliance (IPPSSession)…\n");
    // Store token in a PS variable to avoid line-length issues (~2000 chars)
    await this.execRaw(`$_ippsToken = '${token}'`, 5_000);
    const sccCmdlets = [
      "Get-RetentionCompliancePolicy",
      "Get-RetentionComplianceRule",
      "Get-AdaptiveScope",
      "Get-ComplianceTag",
    ];
    await this.execRaw(
      `Connect-IPPSSession -AccessToken $_ippsToken ` +
        `-Organization '${this.escape(org)}' ` +
        `-CommandName ${sccCmdlets.join(",")} ` +
        `-ShowBanner:$false -ErrorAction Stop`,
      120_000,
    );

    this.ready = true;
    process.stderr.write("[PsExecutor] Sessions connected ✓\n");
  }

  async shutdown(): Promise<void> {
    if (this.proc) {
      this.proc.stdin!.end("exit\n");
      this.proc.kill();
      this.proc = null;
      this.ready = false;
    }
  }

  /* ───────── Token Acquisition ───────── */

  /**
   * Spawn a dedicated short-lived pwsh process to acquire an access token
   * via MSAL's AcquireTokenInteractive. This opens the system browser for
   * sign-in and captures the token from stdout.
   *
   * Why a separate process? The main session's stdin/stdout are piped for
   * marker-based parsing. AcquireTokenInteractive needs to open a browser
   * and listen on localhost for the redirect — this doesn't work in the
   * piped child process.
   */
  private acquireAccessToken(
    scope: string,
    upn: string,
    org: string,
    timeoutMs: number,
  ): Promise<string> {
    const appId = "fb78d390-0c51-40cd-8e17-fdbfab77341b"; // EXO v3 REST API
    const escapedUpn = this.escape(upn);

    // Self-contained PS script. stdout = token ONLY. stderr = log messages.
    const script = [
      `$ErrorActionPreference = 'Stop'`,
      // Find MSAL DLL bundled with ExchangeOnlineManagement module
      `$exoModule = Get-Module ExchangeOnlineManagement -ListAvailable | Select-Object -First 1`,
      `if (-not $exoModule) { throw 'ExchangeOnlineManagement module not found' }`,
      `$msalPath = Join-Path $exoModule.ModuleBase 'NetCore' 'Microsoft.Identity.Client.dll'`,
      `if (-not (Test-Path $msalPath)) { $msalPath = Join-Path $exoModule.ModuleBase 'NetFramework' 'Microsoft.Identity.Client.dll' }`,
      `if (-not (Test-Path $msalPath)) { throw 'MSAL DLL not found in EXO module' }`,
      `Add-Type -Path $msalPath -ErrorAction SilentlyContinue`,
      ``,
      `$authority = 'https://login.microsoftonline.com/${this.escape(org)}'`,
      `$appBuilder = [Microsoft.Identity.Client.PublicClientApplicationBuilder]::Create('${appId}')`,
      `$appBuilder = $appBuilder.WithAuthority($authority)`,
      `$appBuilder = $appBuilder.WithRedirectUri('http://localhost')`,
      `$app = $appBuilder.Build()`,
      ``,
      `$scopes = [string[]]@('${scope}')`,
      ``,
      `# Try silent first (cached token)`,
      `$accounts = $app.GetAccountsAsync().GetAwaiter().GetResult()`,
      `$account = $accounts | Where-Object { $_.Username -eq '${escapedUpn}' } | Select-Object -First 1`,
      `if ($account) {`,
      `  try {`,
      `    $silentResult = $app.AcquireTokenSilent($scopes, $account).ExecuteAsync().GetAwaiter().GetResult()`,
      `    [Console]::Error.WriteLine('[PsExecutor] Token acquired silently (cached)')`,
      `    [Console]::Out.Write($silentResult.AccessToken)`,
      `    exit 0`,
      `  } catch { }`,
      `}`,
      ``,
      `# Interactive browser auth`,
      `[Console]::Error.WriteLine('[PsExecutor] Opening browser for sign-in…')`,
      `$builder = $app.AcquireTokenInteractive($scopes)`,
      `$builder = $builder.WithLoginHint('${escapedUpn}')`,
      `$builder = $builder.WithUseEmbeddedWebView($false)`,
      `$tokenResult = $builder.ExecuteAsync().GetAwaiter().GetResult()`,
      ``,
      `[Console]::Error.WriteLine('[PsExecutor] Token acquired successfully')`,
      `[Console]::Out.Write($tokenResult.AccessToken)`,
    ].join("\n");

    return new Promise<string>((resolve, reject) => {
      const child = spawn("pwsh", ["-NoProfile", "-NonInteractive", "-Command", script], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: false, // allow browser launch
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString();
        stderr += msg;
        // Forward to MCP Output panel
        process.stderr.write(msg);
      });

      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`Token acquisition timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0) {
          reject(new Error(`Token acquisition failed (exit ${code}): ${stderr.trim()}`));
          return;
        }
        const token = stdout.trim();
        if (!token || token.length < 100) {
          reject(new Error(`Invalid access token (length=${token?.length}). stderr: ${stderr.trim()}`));
          return;
        }
        process.stderr.write(`[PsExecutor] Access token acquired (${token.length} chars)\n`);
        resolve(token);
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`Failed to spawn PowerShell for auth: ${err.message}`));
      });
    });
  }

  /* ───────── Public API ───────── */

  /**
   * Execute a **validated** PowerShell command.
   * Returns the raw text output.  Rejects blocked cmdlets.
   */
  async execute(command: string): Promise<PsResult> {
    if (!this.ready) {
      return { success: false, output: "", error: "PowerShell session not initialized" };
    }
    const v = validateCommand(command);
    if (!v.valid) {
      return { success: false, output: "", error: v.violation };
    }
    try {
      const out = await this.execRaw(command);
      if (out.startsWith("PS_ERROR:")) {
        return { success: false, output: "", error: out.slice(10).trim() };
      }
      return { success: true, output: out };
    } catch (err) {
      return { success: false, output: "", error: String(err) };
    }
  }

  /**
   * Execute a command and attempt to JSON-parse the output.
   */
  async executeJson<T = any>(command: string): Promise<PsJsonResult<T>> {
    const r = await this.execute(command);
    if (!r.success) return { success: false, raw: r.output, error: r.error };
    try {
      const data = JSON.parse(r.output) as T;
      return { success: true, data, raw: r.output };
    } catch {
      // Output wasn't JSON — still return the raw text
      return { success: true, raw: r.output };
    }
  }

  /* ───────── Internals ───────── */

  /** Send a command and read stdout until the end-marker appears. */
  private execRaw(command: string, timeoutMs = 180_000): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(new Error("No pwsh process"));

      const marker = `__MCP_END_${randomUUID()}__`;
      this.buf = "";

      // CRITICAL: Send everything as a SINGLE LINE ending with \n.
      // PowerShell's piped stdin parser can hang on multi-line try/catch blocks.
      // The working dlm-purview-agent uses this same single-line pattern.
      const script =
        `try { ${command} } catch { Write-Output "PS_ERROR: $($_.Exception.Message)" }; ` +
        `Write-Output '${marker}'\n`;

      const timeout = setTimeout(() => reject(new Error("Command timed out")), timeoutMs);

      const poll = setInterval(() => {
        const idx = this.buf.indexOf(marker);
        if (idx !== -1) {
          clearInterval(poll);
          clearTimeout(timeout);
          const output = this.buf.substring(0, idx).trim();
          this.buf = this.buf.substring(idx + marker.length);
          resolve(output);
        }
      }, 150);

      this.proc.stdin!.write(script);
    });
  }

  /** Wait for pwsh to be responsive after spawn. */
  private waitForMarker(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(new Error("No pwsh process"));
      const marker = `__READY_${randomUUID()}__`;
      this.buf = "";
      this.proc.stdin!.write(`Write-Output '${marker}'\n`);

      const timeout = setTimeout(() => reject(new Error("pwsh startup timeout")), 30_000);
      const poll = setInterval(() => {
        if (this.buf.includes(marker)) {
          clearInterval(poll);
          clearTimeout(timeout);
          this.buf = "";
          resolve();
        }
      }, 100);
    });
  }

  /** Escape single quotes for safe embedding in PowerShell strings. */
  private escape(value: string): string {
    return value.replace(/'/g, "''");
  }
}
