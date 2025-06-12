#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from "@modelcontextprotocol/sdk/types.js";
import axios from 'axios';

// Environment variables
const ZOHO_CLIENT_ID = process.env.ZOHO_CLIENT_ID;
const ZOHO_CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const ZOHO_REFRESH_TOKEN = process.env.ZOHO_REFRESH_TOKEN;
const ZOHO_ACCOUNTS_BASE_URL = process.env.ZOHO_ACCOUNTS_BASE_URL || 'https://accounts.zoho.com';
const ZOHO_DESK_API_BASE_URL = process.env.ZOHO_DESK_API_BASE_URL || 'https://desk.zoho.com/api/v1';

const SERVER_NAME = "mcp-zoho-desk";

if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
  console.error("Missing required environment variables: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN");
  process.exit(1);
}

// Token management
let currentAccessToken: string | null = null;
let tokenExpiryTime: number | null = null;

interface ZohoAccessTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
  error?: string;
}

interface ZohoThread {
  id: string;
  channel: string;
  status: string;
  content: string;
  contentType?: string;
  isForward?: boolean;
  isPrivate?: boolean;
  createdTime: string;
  direction: string;
  author: {
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    type: string;
    photoURL?: string;
  };
  attachments?: Array<{
    id: string;
    name: string;
    size: string;
    href: string;
  }>;
  hasAttach?: boolean;
  summary?: string;
  plainText?: string;
}

interface ZohoTicket {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  contactName?: string;
  email?: string;
  createdTime?: string;
  contact?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
}

async function getZohoAccessToken(): Promise<string> {
  if (currentAccessToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
    return currentAccessToken;
  }

  console.error("Refreshing Zoho access token...");
  try {
    const response = await axios.post<ZohoAccessTokenResponse>(
      `${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token`,
      new URLSearchParams({
        refresh_token: ZOHO_REFRESH_TOKEN!,
        client_id: ZOHO_CLIENT_ID!,
        client_secret: ZOHO_CLIENT_SECRET!,
        grant_type: 'refresh_token',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    if (response.data.error) {
      throw new McpError(ErrorCode.InternalError, `Zoho token refresh error: ${response.data.error}`);
    }

    currentAccessToken = response.data.access_token;
    tokenExpiryTime = Date.now() + (response.data.expires_in - 300) * 1000; // 5 minutes buffer
    console.error("Access token refreshed successfully");
    return currentAccessToken;

  } catch (error: any) {
    currentAccessToken = null;
    tokenExpiryTime = null;
    const errorMessage = error.response?.data?.error || error.message || "Unknown token refresh error";
    console.error(`Error refreshing Zoho access token: ${errorMessage}`);
    throw new McpError(ErrorCode.InternalError, `Failed to refresh Zoho access token: ${errorMessage}`);
  }
}

const server = new Server(
  {
    name: SERVER_NAME,
    version: "1.0.0",
    description: "MCP Server for Zoho Desk API integration"
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_zoho_ticket_details",
        description: "Get details of a specific Zoho Desk ticket by ID",
        inputSchema: {
          type: "object",
          properties: {
            ticket_id: {
              type: "string",
              description: "The ID of the Zoho Desk ticket to fetch",
            },
          },
          required: ["ticket_id"],
        },
      },
      {
        name: "get_zoho_thread_details",
        description: "Get a specific thread from a Zoho Desk ticket",
        inputSchema: {
          type: "object",
          properties: {
            ticket_id: {
              type: "string",
              description: "The ID of the Zoho Desk ticket",
            },
            thread_id: {
              type: "string",
              description: "The ID of the thread to fetch",
            },
            include: {
              type: "string",
              description: "Set to 'plainText' to include plain text content",
              enum: ["plainText"],
            },
          },
          required: ["ticket_id", "thread_id"],
        },
      },
      {
        name: "get_latest_zoho_thread",
        description: "Get the most recent thread of a specific Zoho Desk ticket",
        inputSchema: {
          type: "object",
          properties: {
            ticket_id: {
              type: "string",
              description: "The ID of the Zoho Desk ticket",
            },
            needPublic: {
              type: "boolean",
              description: "Set to true to ensure the latest thread is public",
              default: false,
            },
            needIncomingThread: {
              type: "boolean",
              description: "Set to true to ensure the latest thread is incoming",
              default: false,
            },
            include: {
              type: "string",
              description: "Set to 'plainText' to include plain text content",
              enum: ["plainText"],
            },
            threadStatus: {
              type: "string",
              description: "Filter by receipt status of the thread",
              enum: ["success", "failed"],
            },
          },
          required: ["ticket_id"],
        },
      },
      {
        name: "list_zoho_threads",
        description: "List threads associated with a specific Zoho Desk ticket",
        inputSchema: {
          type: "object",
          properties: {
            ticket_id: {
              type: "string",
              description: "The ID of the Zoho Desk ticket",
            },
            limit: {
              type: "number",
              description: "Number of threads to retrieve per page",
            },
            from: {
              type: "number",
              description: "Starting index for pagination",
            },
          },
          required: ["ticket_id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  const args = request.params.arguments;

  try {
    const accessToken = await getZohoAccessToken();

    switch (toolName) {
      case "get_zoho_ticket_details": {
        const ticketId = args?.ticket_id;
        if (typeof ticketId !== 'string' || !ticketId) {
          throw new McpError(ErrorCode.InvalidParams, "Missing or invalid 'ticket_id' argument");
        }

        const response = await axios.get(`${ZOHO_DESK_API_BASE_URL}/tickets/${ticketId}`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "get_zoho_thread_details": {
        const ticketId = args?.ticket_id;
        const threadId = args?.thread_id;
        const include = args?.include;

        if (typeof ticketId !== 'string' || !ticketId) {
          throw new McpError(ErrorCode.InvalidParams, "Missing or invalid 'ticket_id' argument");
        }
        if (typeof threadId !== 'string' || !threadId) {
          throw new McpError(ErrorCode.InvalidParams, "Missing or invalid 'thread_id' argument");
        }

        const params: any = {};
        if (include) params.include = include;

        const response = await axios.get<ZohoThread>(
          `${ZOHO_DESK_API_BASE_URL}/tickets/${ticketId}/threads/${threadId}`,
          {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params
          }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "get_latest_zoho_thread": {
        const ticketId = args?.ticket_id;
        if (typeof ticketId !== 'string' || !ticketId) {
          throw new McpError(ErrorCode.InvalidParams, "Missing or invalid 'ticket_id' argument");
        }

        const params: any = {};
        if (args?.needPublic !== undefined) params.needPublic = args.needPublic;
        if (args?.needIncomingThread !== undefined) params.needIncomingThread = args.needIncomingThread;
        if (args?.include) params.include = args.include;
        if (args?.threadStatus) params.threadStatus = args.threadStatus;

        const response = await axios.get<ZohoThread>(
          `${ZOHO_DESK_API_BASE_URL}/tickets/${ticketId}/latestThread`,
          {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params
          }
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(response.data, null, 2),
            },
          ],
        };
      }

      case "list_zoho_threads": {
        const ticketId = args?.ticket_id;
        if (typeof ticketId !== 'string' || !ticketId) {
          throw new McpError(ErrorCode.InvalidParams, "Missing or invalid 'ticket_id' argument");
        }

        const params: any = {};
        if (args?.limit !== undefined) params.limit = args.limit;
        if (args?.from !== undefined) params.from = args.from;

        const response = await axios.get(
          `${ZOHO_DESK_API_BASE_URL}/tickets/${ticketId}/threads`,
          {
            headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
            params
          }
        );

        const responseData = response.data?.data ?? [];
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(responseData, null, 2),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }
  } catch (error: any) {
    const errorMessage = error.response?.data?.message || 
                        error.response?.data?.errorCode || 
                        error.message || 
                        "Unknown error occurred";
    
    console.error(`Error in ${toolName}:`, errorMessage);
    
    if (error instanceof McpError) {
      throw error;
    }
    
    throw new McpError(ErrorCode.InternalError, `Failed to execute ${toolName}: ${errorMessage}`);
  }
});

async function main() {
  try {
    await getZohoAccessToken();
    console.error("Initial Zoho access token obtained successfully");
  } catch (err) {
    console.error("Failed to get initial Zoho access token:", err);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${SERVER_NAME} MCP server running on stdio`);
}

server.onerror = (error) => {
  console.error(`[${SERVER_NAME} MCP Error]`, error);
};

process.on('SIGINT', async () => {
  console.error(`\nShutting down ${SERVER_NAME} server...`);
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error(`\nShutting down ${SERVER_NAME} server...`);
  await server.close();
  process.exit(0);
});

main().catch((error) => {
  console.error("Server startup error:", error);
  process.exit(1);
});