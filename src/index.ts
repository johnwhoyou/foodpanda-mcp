#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FoodpandaClient } from "./foodpanda-client.js";
import { createServer } from "./server.js";
import { loadPersistedToken } from "./token-manager.js";

// Token loading priority: persisted file > env var > null (tokenless startup)
const sessionToken =
  loadPersistedToken() || process.env.FOODPANDA_SESSION_TOKEN || null;

const latitude = parseFloat(process.env.FOODPANDA_LATITUDE || "");
const longitude = parseFloat(process.env.FOODPANDA_LONGITUDE || "");

if (isNaN(latitude) || isNaN(longitude)) {
  console.error(
    "Error: FOODPANDA_LATITUDE and FOODPANDA_LONGITUDE environment variables are required.\n" +
      "These should be the coordinates of your delivery address.\n" +
      "Example: FOODPANDA_LATITUDE=14.5623 FOODPANDA_LONGITUDE=121.0137"
  );
  process.exit(1);
}

if (sessionToken) {
  console.error("foodpanda-mcp: loaded session token");
} else {
  console.error(
    "foodpanda-mcp: no session token found. Use the refresh_token tool to log in."
  );
}

const client = new FoodpandaClient(sessionToken, latitude, longitude);
const server = createServer(client);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("foodpanda-mcp server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
