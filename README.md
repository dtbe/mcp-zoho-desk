# Zoho Desk MCP Server

An MCP server for Zoho Desk integration. Lets your AI assistant access ticket information directly from your helpdesk.

## Features

- Get ticket details by ID
- Read ticket conversations and threads
- Fetch latest updates

## Setup

### 1. Install

```bash
git clone https://github.com/dtbe/mcp-zoho-desk.git
cd mcp-zoho-desk
npm install
npm run build
```

### 2. Zoho API Setup

1. Go to [Zoho API Console](https://api-console.zoho.com/)
2. Create a "Server-based Application" 
3. Set redirect URI: `http://localhost:3000/oauth/callback`
4. Enable scope: `Desk.tickets.READ`
5. Note your **Client ID** and **Client Secret**

### 3. Get Refresh Token

```bash
node -e "process.env.ZOHO_CLIENT_ID='your_id'; process.env.ZOHO_CLIENT_SECRET='your_secret'; require('./setup-oauth.cjs')"
```

Follow the browser flow and save the refresh token.
**Note on Regional Endpoints:** The Zoho Desk API has different regional endpoints (e.g., `.eu`, `.in`, `.com.au`). This server currently defaults to `https://desk.zoho.com/api/v1`. While this may need to be configured for specific regional deployments, it's not a concern for the general functionality of this public repository.

### 4. MCP Client Configuration

Add to your MCP client config:

```json
{
  "mcpServers": {
    "mcp-zoho-desk": {
      "command": "node",
      "args": ["/path/to/mcp-zoho-desk/build/index.js"],
      "env": {
        "ZOHO_CLIENT_ID": "your_client_id",
        "ZOHO_CLIENT_SECRET": "your_client_secret", 
        "ZOHO_REFRESH_TOKEN": "your_refresh_token"
      },
      "alwaysAllow": [
        "list_zoho_threads",
        "get_latest_zoho_thread",
        "get_zoho_thread_details",
        "get_zoho_ticket_details"
      ],
      "disabled": false
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `get_zoho_ticket_details` | Get ticket information |
| `get_zoho_thread_details` | Get specific conversation thread |
| `get_latest_zoho_thread` | Get most recent ticket update |
| `list_zoho_threads` | List all ticket conversations |

## Extending
### Usage Example

Here's an example of using the `list_zoho_threads` tool:

```json
{
  "tool": "list_zoho_threads",
  "input": {
    "ticket_id": "12345678901234567890",
    "limit": 10,
    "from": 0
  },
  "output": "JSON array of thread objects with potentially truncated content for pagination"
}
```

This implements basic read operations. The [Zoho Desk API](https://desk.zoho.com/DeskAPIDocument) supports much more - creating tickets, managing contacts, handling attachments, etc.

## Development

```bash
npm run watch      # Development mode
npm run inspector  # Debug with MCP inspector
```

## License

MIT

---

*Built with 🦘 [Roo Code](https://github.com/RooCodeInc/Roo-Code)*