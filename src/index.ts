#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FoodpandaClient } from "./foodpanda-client.js";
import { createServer } from "./server.js";

const sessionToken = process.env.FOODPANDA_SESSION_TOKEN;
const latitude = parseFloat(process.env.FOODPANDA_LATITUDE || "");
const longitude = parseFloat(process.env.FOODPANDA_LONGITUDE || "");

if (!sessionToken) {
  console.error(
    "Error: FOODPANDA_SESSION_TOKEN environment variable is required.\n" +
      "To get your token:\n" +
      "1. Log into foodpanda.ph in your browser\n" +
      "2. Open DevTools → Network tab\n" +
      "3. Find any request to ph.fd-api.com\n" +
      "4. Copy the Bearer token from the Authorization header (without the 'Bearer ' prefix)\n" +
      "5. Set it as FOODPANDA_SESSION_TOKEN"
  );
  process.exit(1);
}

if (isNaN(latitude) || isNaN(longitude)) {
  console.error(
    "Error: FOODPANDA_LATITUDE and FOODPANDA_LONGITUDE environment variables are required.\n" +
      "These should be the coordinates of your delivery address.\n" +
      "Example: FOODPANDA_LATITUDE=14.5623 FOODPANDA_LONGITUDE=121.0137"
  );
  process.exit(1);
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
