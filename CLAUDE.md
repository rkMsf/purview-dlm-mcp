# CLAUDE.md — Purview DLM Diagnostics MCP Server

## Project Purpose

This is an MCP (Model Context Protocol) server that enables AI assistants to diagnose Microsoft Purview Data Lifecycle Management (DLM) issues in Exchange Online. It provides two tools—`run_powershell` and `get_execution_log`—that let an AI run read-only PowerShell commands against Exchange Online and Security & Compliance sessions and review the diagnostic trail.

## Architecture

```
src/
├── index.ts                  # MCP server entry point, tool definitions
├── powershell/
│   ├── executor.ts           # Long-lived pwsh process manager (MSAL auth, stdin/stdout piping)
│   └── allowlist.ts          # Cmdlet allowlist + validation logic
├── tsg-diagnostics.ts        # TSG diagnostic evaluation engine (parsers + evaluators for 10 TSGs)
├── logger.ts                 # Execution log (append-only, Markdown export)
├── utils.ts                  # Shared utilities
├── e2e.test.ts               # End-to-end tests
├── tsg.test.ts               # TSG evaluator unit tests
└── test-setup.ts             # Test environment setup
```

### Key Components

- **`index.ts`** — Registers two MCP tools (`run_powershell`, `get_execution_log`), connects the stdio transport, and initializes PowerShell sessions in the background.
- **`executor.ts`** — Spawns a single long-lived `pwsh` process, acquires an MSAL access token via interactive browser auth, and connects to Exchange Online + IPPSSession. Commands are piped via stdin with JSON-fence markers for output parsing.
- **`allowlist.ts`** — Defines the explicit set of allowed cmdlets (`Get-*`, `Test-*`, `Export-*`) and blocked verb prefixes (`Set-*`, `New-*`, `Remove-*`, etc.). Every command is validated before execution.
- **`tsg-diagnostics.ts`** — Pure evaluation engine that parses PowerShell Format-List output and evaluates against reference guide checklists. Produces structured findings with severity, remediation, and cross-references.

## Skills

Skills are self-contained diagnostic guides used by AI assistants:

- **Location:** `.github/skills/` (for GitHub Copilot) and `.claude/skills/` (for Claude Code)
- **Current skills:**
  - `dlm-diagnostics` — 11 troubleshooting guides for DLM issues (retention policies, archive, inactive mailboxes, etc.)
  - `asklearn` — Fallback skill that surfaces Microsoft Learn documentation for Purview topics
  - `skill-creator` — Meta-skill for authoring new skills following project conventions

## Security Model

1. **Read-only allowlist** — Only `Get-*`, `Test-*`, `Export-*` cmdlets may be executed. All `Set-*`, `New-*`, `Remove-*`, `Enable-*`, `Start-*`, `Invoke-*` are blocked at the validation layer (`allowlist.ts`).
2. **No stored credentials** — Authentication uses MSAL interactive browser flow; tokens are held in-memory only.
3. **Session isolation** — Each MCP server instance runs its own PowerShell process with its own session.
4. **Audit trail** — Every command and result is logged via `ExecutionLog` and retrievable through `get_execution_log`.

## Development Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (tsc)
npm run dev          # Watch mode (tsc --watch)
npm test             # Run tests (vitest run)
npm run test:watch   # Watch tests (vitest)
npm start            # Start the MCP server (node dist/index.js)
```

## Testing

- **Test runner:** Vitest
- **Test files:** `src/e2e.test.ts` (end-to-end), `src/tsg.test.ts` (TSG evaluator unit tests)
- **Environment variables:** Tests may require `DLM_UPN` and `DLM_ORGANIZATION` to be set for Exchange Online connectivity. `DLM_COMMAND_TIMEOUT_MS` optionally overrides the default command timeout (180 000 ms).
- **Known gotchas:**
  1. E2E tests require a live PowerShell 7 (`pwsh`) installation and connected Exchange Online sessions.
  2. TSG evaluator tests are pure unit tests and run without external dependencies.
  3. Tests use the `test-setup.ts` file for environment configuration.
  4. The build must succeed (`npm run build`) before E2E tests can run against `dist/`.
  5. Vitest config is in `vitest.config.ts` at the project root.

## Coding Conventions

- **Copyright headers:** Every `.ts` file starts with:
  ```
  // Copyright (c) Microsoft Corporation.
  // Licensed under the MIT License.
  ```
- **Module system:** ESM (`"type": "module"` in package.json, `.js` extensions in imports)
- **TypeScript:** Strict mode, explicit return types on exported functions
- **Schema validation:** Use Zod for MCP tool input schemas
- **Pure evaluators:** Diagnostic evaluation functions in `tsg-diagnostics.ts` are pure (no I/O, no side effects) — they take parsed data and return structured results
- **Naming:** kebab-case for file names, camelCase for variables/functions, PascalCase for types/classes

## Key File Paths

| Purpose | Path |
|---------|------|
| MCP server entry point | `src/index.ts` |
| Runtime configuration | `src/config.ts` |
| PowerShell executor | `src/powershell/executor.ts` |
| Cmdlet allowlist | `src/powershell/allowlist.ts` |
| TSG evaluation engine | `src/tsg-diagnostics.ts` |
| Execution logger | `src/logger.ts` |
| Ask Learn topic lookup | `src/asklearn.ts` |
| DLM diagnostics skill | `.github/skills/dlm-diagnostics/SKILL.md` |
| Skill creator guide | `.github/skills/skill-creator/SKILL.md` |
| Build config | `tsconfig.json` |
| Test config | `vitest.config.ts` |
| Package config | `package.json` |
