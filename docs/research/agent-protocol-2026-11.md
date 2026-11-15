# Agent protocol check: MCP or an alternative

Research date: 2026-11-15, for
[#536](https://github.com/martonpaulo/tabelo/issues/536). Question: is there a
current protocol clearly better than MCP for a local Claude agent (Claude Code
or Claude Desktop) talking to an open Tabelo tab? MCP stays unless one is.

## Access limits

This session's network allowed only `code.claude.com` and
`support.claude.com`. The MCP specification site, the A2A protocol site and the
WebMCP draft were refused by the egress proxy, so their current text was not
re-read here. The comparison below therefore relies on the two Claude pages
read today and on the primary sources already cited, with their dates, in
[local-agent-connection](local-agent-connection.md). Repeat the check against
those sites when they are reachable.

## Sources read today

- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp): Claude
  Code connects to MCP servers over local stdio (`claude mcp add ... -- <command>`),
  streamable HTTP, SSE (deprecated) and WebSocket. It reads an `mcpServers`
  block written for Claude Desktop, can import Claude Desktop's
  `claude_desktop_config.json`, and shows a Claude Desktop entry with
  `command` and `args`. Claude's two local clients therefore share one server
  shape.
- [Getting started with local MCP servers on Claude Desktop](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop):
  Claude Desktop runs local MCP servers, either configured by JSON or packaged
  as a one-click desktop extension (`.mcpb`).

## Comparison

| Option | For a local Claude talking to one Tabelo tab |
| --- | --- |
| MCP over stdio (current) | The protocol both Claude clients speak natively for local tools; no account, registry or tunnel. Already implemented, tested with the official SDK client, and registered in Claude Code. Keep. |
| Agent2Agent (A2A) | Connects one agent to another agent, not an agent to an application's tools. Tabelo has no agent of its own to expose, and neither Claude client documents A2A as a way to add local tools. Not better here. |
| WebMCP | Lets a page expose tools from the browser itself, which would remove the local helper. The last primary source read (2026-08-07, cited in local-agent-connection) still described an origin trial and no route to an arbitrary local MCP client; neither Claude page read today names it. Not usable today; a possible future adapter over the same commands. |
| Browser extension plus Native Messaging | Still a different process boundary and an extra install, with no gain for Claude, which already starts stdio servers. Not better. |
| Claude Desktop extension (`.mcpb`) | A packaging of the same stdio MCP server, not another protocol. A possible later convenience for Claude Desktop users; out of scope for #536. |

## Result

No alternative is clearly better. MCP over stdio stays, unchanged, and the
setup offers Claude Code (`claude mcp add`) and Claude Desktop (an
`mcpServers.tabelo` entry in `claude_desktop_config.json`).
