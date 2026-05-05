# Next DevTools MCP — Integration & Usage

This document explains how to enable and use the `next-devtools-mcp` bridge (Model Context Protocol server) with this repository so coding agents can inspect runtime state, errors, routes, and use development automation tools.

**Requirements:** Next.js 16+ (app router), Node.js (see upstream repo — Node v20.19+ recommended), and an MCP-capable agent client.

**Files added:**

- `.mcp.json`: configures an MCP client to automatically start `next-devtools-mcp`.

**Quick start**

- **Install dependencies (if needed):**

```bash
pnpm install
# or
npm install
```

- **Start the Next.js dev server:**

```bash
npm run dev
# or
pnpm dev
```

When your dev server is running, `next-devtools-mcp` will discover the built-in MCP endpoint at `http://localhost:3000/_next/mcp` (or the port your server uses) and provide agent tooling (runtime errors, logs, metadata, etc.).

**What the `.mcp.json` does**

- `mcpServers.next-devtools` config instructs your MCP client (or agent environment that reads `.mcp.json`) to run `npx -y next-devtools-mcp@latest`. This ensures the latest MCP bridge is launched and can connect to your running Next.js dev server.

Example `.mcp.json` (added to repo root):

```json
{
  "mcpServers": {
    "next-devtools": {
      "command": "npx",
      "args": ["-y", "next-devtools-mcp@latest"]
    }
  }
}
```

**Common agent tools available**

- `init`: Initialize the Next.js DevTools MCP context. Call this at the start of the session.
- `nextjs_index`: Discover running Next.js dev servers and available tools.
- `nextjs_call`: Execute tools against a specific dev server (e.g., `get_errors`, `get_logs`, `get_page_metadata`).
- `nextjs_docs`: Query Next.js docs and knowledge base.
- `enable_cache_components` / `upgrade_nextjs_16`: Automation helpers for migrations and cache components.
- `browser_eval`: Playwright-backed browser automation (when available).

**Telemetry & privacy**

- `next-devtools-mcp` collects anonymous telemetry by default to improve the tool. To opt out permanently, add to your shell config (e.g., `~/.zshrc`):

```bash
export NEXT_TELEMETRY_DISABLED=1
```

- To delete local telemetry data created by `next-devtools-mcp`:

```bash
rm -rf ~/.next-devtools-mcp
```

**Local development of next-devtools-mcp**

If you want to run a local copy of the MCP server instead of the npm-installed package:

```bash
# clone locally
git clone https://github.com/vercel/next-devtools-mcp.git ~/dev/next-devtools-mcp
cd ~/dev/next-devtools-mcp
pnpm install
pnpm build

# then update .mcp.json to point to the local built server:
# {
#   "mcpServers": {
#     "next-devtools": {
#       "command": "node",
#       "args": ["/absolute/path/to/next-devtools-mcp/dist/index.js"]
#     }
#   }
# }
```

Replace `/absolute/path/to/next-devtools-mcp` with your actual path.

**Troubleshooting**

- **MCP server not connecting**: Ensure Next.js dev server is running (`npm run dev`). Restart the dev server if it was running when you first started the MCP bridge.
- **`No server info found`**: This usually means no Next.js 16+ dev server with the MCP endpoint was discovered. Confirm Next.js is v16+ and the dev server started successfully.
- **Module not found errors**: Clear the npx cache and restart the MCP client:

```bash
npx cache clear --force
# or remove ~/.npm/_npx caches and try again
```

**Notes & recommendations**

- Call the `init` tool at the start of agent sessions — this sets a documentation-first context and loads the Next.js knowledge base for accurate suggestions.
- Keep `.mcp.json` at the repository root so agent clients detect and run the MCP bridge automatically.
- If you use a different package manager (pnpm), `npx -y` still works; alternatively, replace with an equivalent command that runs the package.

**Links & resources**

- Next DevTools MCP (upstream): https://github.com/vercel/next-devtools-mcp
- Next.js MCP guide: https://nextjs.org/docs/app/guides/mcp

---

If you want, I can:

- commit these files and open a PR; or
- update the `.mcp.json` to use a pinned version instead of `@latest`.
