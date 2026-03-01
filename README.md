# foodpanda-mcp

An MCP server that lets AI assistants order food from [foodpanda.ph](https://www.foodpanda.ph/) on your behalf.

Tell your AI assistant what you want to eat, and it handles the rest — searching restaurants, browsing menus, building a cart, and placing orders through your foodpanda account.

## Features

- Search restaurants by name or cuisine near your delivery address
- Browse full menus with prices, descriptions, and customization options
- Build a cart with real-time price validation from foodpanda
- Two-step checkout with order preview and explicit confirmation
- Checkout with Cash on Delivery (credit card and GCash require browser-based payment flows and are not supported)
- Automatic token refresh via browser login (no more copying tokens from DevTools)

## Quick Start

### 1. Get your delivery coordinates

Get the latitude and longitude of your delivery address (right-click on [Google Maps](https://maps.google.com) → copy coordinates).

> **Note:** You no longer need to manually copy a session token. The `refresh_token` tool handles authentication by opening a browser window for you to log in.

### 2. Configure your MCP client

#### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "foodpanda": {
      "command": "npx",
      "args": ["-y", "foodpanda-mcp"],
      "env": {
        "FOODPANDA_LATITUDE": "14.5623",
        "FOODPANDA_LONGITUDE": "121.0137"
      }
    }
  }
}
```

#### Other MCP Clients

Any MCP-compatible client that supports stdio transport will work. Set the two coordinate environment variables and run `npx foodpanda-mcp`. On first use, the AI will open a browser for you to log in to foodpanda.

### 3. Try it out

Ask your AI assistant:

> "Search for Jollibee near me and show me their menu"

> "Add 1 Chickenjoy to my cart"

> "Preview my order and let me confirm before placing it"

## Available Tools

| Tool | Description |
|------|-------------|
| `search_restaurants` | Search for restaurants by name or cuisine |
| `get_restaurant_details` | Get restaurant info (hours, delivery fee, minimum order) |
| `get_menu` | Browse a restaurant's menu organized by category |
| `get_item_details` | Get full item details including topping/customization options |
| `add_to_cart` | Add items to your cart (validates prices with foodpanda) |
| `get_cart` | View current cart contents and totals |
| `remove_from_cart` | Remove items from cart |
| `preview_order` | Preview order summary with delivery address and payment methods |
| `place_order` | Place the order after user confirmation |
| `refresh_token` | Open a browser to log in and refresh the session token |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FOODPANDA_SESSION_TOKEN` | No | JWT bearer token (optional — use `refresh_token` tool instead) |
| `FOODPANDA_LATITUDE` | Yes | Latitude of your delivery address |
| `FOODPANDA_LONGITUDE` | Yes | Longitude of your delivery address |

## Order Safety

The checkout flow is designed with a **human-in-the-loop** pattern:

1. `preview_order` shows the full order summary (items, totals, delivery address, payment methods)
2. The AI is instructed to **always show this to you and ask for confirmation**
3. `place_order` only executes after you explicitly approve

This prevents accidental orders — the AI cannot skip the confirmation step.

## How It Works

- **Search** uses foodpanda's GraphQL API with Apollo persisted queries
- **Restaurant details and menus** use the REST API at `/api/v5/vendors/{code}`
- **Cart** is stateless on foodpanda's side — this server maintains cart state in memory and sends the full cart to `/api/v5/cart/calculate` for price validation on every change
- **Checkout** fetches your saved addresses and payment methods, then submits to `/api/v5/cart/checkout`
- Prices are in PHP (Philippine Peso)

## Building from Source

```bash
git clone https://github.com/johnwhoyou/foodpanda-mcp.git
cd foodpanda-mcp
npm install    # also installs Google Chrome via postinstall
npm run build
```

Then use the local build in your MCP client config:

```json
{
  "mcpServers": {
    "foodpanda": {
      "command": "node",
      "args": ["/absolute/path/to/foodpanda-mcp/build/index.js"],
      "env": {
        "FOODPANDA_LATITUDE": "14.5623",
        "FOODPANDA_LONGITUDE": "121.0137"
      }
    }
  }
}
```

## Limitations

- **Session tokens expire.** The `refresh_token` tool handles this automatically — the AI opens a browser for you to log in when needed.
- **No official API.** This server reverse-engineers foodpanda's internal web API. It may break if foodpanda changes their API.
- **Philippines only.** Targets foodpanda.ph specifically. Other regions use different API endpoints and may not work.
- **Payment methods.** Only Cash on Delivery is supported. Credit card and GCash require browser-based payment flows (Adyen SDK / app redirect) that cannot be completed through API calls. See [#2](https://github.com/johnwhoyou/foodpanda-mcp/issues/2).
- **Single delivery address.** Uses the saved address closest to your configured coordinates.
