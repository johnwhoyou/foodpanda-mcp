# foodpanda-mcp

An MCP server that lets AI assistants order food from [foodpanda.ph](https://www.foodpanda.ph/) on your behalf.

## What it does

Tell your AI assistant what you want to eat, and it handles the rest — searching restaurants, browsing menus, building a cart, and calculating totals through your foodpanda account.

### Available tools

| Tool | Description |
|------|-------------|
| `search_restaurants` | Search for restaurants by name or cuisine |
| `get_restaurant_details` | Get restaurant info (hours, delivery fee, minimum order) |
| `get_menu` | Browse a restaurant's full menu with topping options |
| `add_to_cart` | Add items to your cart (validates prices with foodpanda) |
| `get_cart` | View current cart contents and totals |
| `remove_from_cart` | Remove items from cart |
| `place_order` | *Not yet available* — checkout API not yet reverse-engineered |

## Setup

### 1. Get your session token and delivery coordinates

1. Open [foodpanda.ph](https://www.foodpanda.ph/) and log in
2. Open browser DevTools (F12) -> **Network** tab
3. Browse to a restaurant or search for food
4. Find any request to `ph.fd-api.com`
5. Copy the **Bearer token** from the `Authorization` header (without the `Bearer ` prefix)
6. This is your `FOODPANDA_SESSION_TOKEN`
7. For coordinates, find `latitude` and `longitude` in the request headers or query params, or use Google Maps to get your delivery address coordinates

### 2. Configure your MCP client

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "foodpanda": {
      "command": "node",
      "args": ["/path/to/foodpanda-mcp/build/index.js"],
      "env": {
        "FOODPANDA_SESSION_TOKEN": "your-jwt-token-here",
        "FOODPANDA_LATITUDE": "14.5623",
        "FOODPANDA_LONGITUDE": "121.0137"
      }
    }
  }
}
```

### 3. Build from source

```bash
git clone <repo-url>
cd foodpanda-mcp
npm install
npm run build
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FOODPANDA_SESSION_TOKEN` | Yes | JWT bearer token from your foodpanda session |
| `FOODPANDA_LATITUDE` | Yes | Latitude of your delivery address |
| `FOODPANDA_LONGITUDE` | Yes | Longitude of your delivery address |

## Development

```bash
npm run dev    # Watch mode — recompiles on changes
npm run build  # One-time build
npm start      # Run the server
```

## How it works

- **Search** uses foodpanda's GraphQL API with a persisted query hash
- **Restaurant details and menus** use the REST API at `/api/v5/vendors/{code}`
- **Cart is stateless on the server side** — this MCP server maintains cart state in memory and sends the full cart to `/api/v5/cart/calculate` on every add/remove for price validation
- Prices are in PHP (Philippine Peso). A price of `161` means PHP 161.00

## Limitations

- **Session tokens expire.** You'll need to refresh your token periodically by repeating step 1.
- **No official API.** This server reverse-engineers foodpanda's internal web API. It may break if foodpanda changes their API.
- **Philippines only.** This server targets foodpanda.ph specifically.
- **Order placement not yet available.** The checkout/order API has not been reverse-engineered yet.
- **Single delivery address.** The delivery location is set via environment variables at startup.
