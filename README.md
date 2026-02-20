# Microsoft Purview DLM Diagnostics MCP

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server for diagnosing Microsoft Purview Data Lifecycle Management issues via Exchange Online PowerShell.

## Features

- **2 MCP tools** — `run_powershell` for executing read-only Exchange Online commands, `get_execution_log` for retrieving a full audit trail
- **11 TSG reference guides** — step-by-step diagnostic workflows aligned to common DLM symptoms
- **72 diagnostic checks** — automated evaluation engine that parses PowerShell output and produces structured findings with remediation
- **Cmdlet allowlist** — only pre-approved read-only cmdlets can be executed; mutating commands are blocked

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [PowerShell 7](https://github.com/PowerShell/PowerShell)
- [ExchangeOnlineManagement](https://www.powershellgallery.com/packages/ExchangeOnlineManagement) PowerShell module (v3.4+)
- Exchange Online administrator credentials with compliance permissions

## Quick Start

```bash
# Clone the repository
git clone https://github.com/rkMsf/purview-dlm-mcp.git
cd purview-dlm-mcp

# Install dependencies
npm install

# Build
npm run build

# Configure environment variables
cp .env.example .env
# Edit .env with your tenant details

# Run the server
npm start
```

## MCP Client Configuration

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dlm-diagnostics": {
      "command": "node",
      "args": ["/path/to/purview-dlm-mcp/dist/index.js"],
      "env": {
        "DLM_UPN": "admin@yourtenant.onmicrosoft.com",
        "DLM_ORGANIZATION": "yourtenant.onmicrosoft.com"
      }
    }
  }
}
```

### VS Code

Add this to your `.vscode/settings.json` or user settings:

```json
{
  "mcp": {
    "servers": {
      "dlm-diagnostics": {
        "command": "node",
        "args": ["/path/to/purview-dlm-mcp/dist/index.js"],
        "env": {
          "DLM_UPN": "admin@yourtenant.onmicrosoft.com",
          "DLM_ORGANIZATION": "yourtenant.onmicrosoft.com"
        }
      }
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `run_powershell` | Execute a read-only Exchange Online PowerShell command against the allowlist |
| `get_execution_log` | Retrieve the log of all commands executed during the current session |

## Supported TSGs

| Symptom | Reference Guide |
|---------|----------------|
| Policy shows Success but content is not retained/deleted on target workloads | `retention-policy-not-applying.md` |
| Policy status shows Error, PolicySyncTimeout, or PendingDeletion | `policy-stuck-error.md` |
| Archive mailbox exists but items stay in the primary mailbox | `items-not-moving-to-archive.md` |
| Archive is near 100 GB but no auxiliary archive is being created | `auto-expanding-archive.md` |
| User was deleted but mailbox was purged instead of becoming inactive | `inactive-mailbox.md` |
| Recoverable Items folder growing uncontrollably or SubstrateHolds is large | `substrateholds-quota.md` |
| Teams retention policy exists but messages remain visible past retention period | `teams-messages-not-deleting.md` |
| Both MRM and Purview retention on a mailbox causing unexpected behavior | `mrm-purview-conflict.md` |
| Adaptive scope includes wrong members or scope query not targeting correct users/sites | `adaptive-scope.md` |
| Auto-apply retention label policy not labeling content or shows "Off (Error)" | `auto-apply-labels.md` |
| SharePoint site cannot be deleted due to retention policy or hold | `sharepoint-site-deletion-blocked.md` |

## Architecture

The server runs a persistent PowerShell 7 session that authenticates to Exchange Online using MSAL interactive auth. Commands flow through:

1. **MCP Server** (`src/index.ts`) — receives tool calls from the MCP client
2. **PowerShell Executor** (`src/powershell/executor.ts`) — manages the PowerShell child process lifecycle
3. **Cmdlet Allowlist** (`src/powershell/allowlist.ts`) — validates every command against the approved cmdlet list before execution
4. **TSG Diagnostics Engine** (`src/tsg-diagnostics.ts`) — evaluates command output against reference guide checklists

## Security Model

- **Read-only allowlist** — only `Get-*`, `Test-*`, and `Export-*` cmdlets are permitted; mutating commands are rejected before reaching PowerShell
- **No stored credentials** — authentication uses MSAL interactive flow; no passwords or tokens are persisted
- **Session isolation** — each server instance runs its own PowerShell process with independent session state

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, testing instructions, and pull request guidelines.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft
trademarks or logos is subject to and must follow
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.

## License

[MIT](LICENSE)
