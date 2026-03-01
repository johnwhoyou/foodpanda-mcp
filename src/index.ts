#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FoodpandaClient } from "./foodpanda-client.js";
import { createServer } from "./server.js";

const sessionToken = process.env.FOODPANDA_SESSION_TOKEN;

if (!sessionToken) {
  console.error(
    "Error: FOODPANDA_SESSION_TOKEN environment variable is required.\n" +
      "To get your token:\n" +
      "1. Log into foodpanda.ph in your browser\n" +
      "2. Open DevTools → Network tab\n" +
      "3. Copy the Cookie or Authorization header from any API request\n" +
      "4. Set it as FOODPANDA_SESSION_TOKEN"
  );
  process.exit(1);
}

const client = new FoodpandaClient(sessionToken);
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
