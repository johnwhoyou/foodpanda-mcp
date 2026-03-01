# foodpanda-mcp

An MCP server that lets AI assistants order food from [foodpanda.ph](https://www.foodpanda.ph/) on your behalf.

## What it does

Tell your AI assistant what you want to eat, and it handles the rest — searching restaurants, browsing menus, and placing orders through your foodpanda account.

### Available tools

| Tool | Description |
|------|-------------|
| `search_restaurants` | Search for restaurants by name or cuisine |
| `get_restaurant_details` | Get restaurant info (hours, delivery fee, minimum order) |
| `get_menu` | Browse a restaurant's full menu |
| `add_to_cart` | Add items to your cart |
| `get_cart` | View current cart contents |
| `remove_from_cart` | Remove items from cart |
| `place_order` | Place the order with your saved payment method |

## Setup

### 1. Get your session token

1. Open [foodpanda.ph](https://www.foodpanda.ph/) and log in
2. Open browser DevTools (F12) → **Network** tab
3. Reload the page or browse to a restaurant
4. Click any request to `foodpanda.ph`
5. Copy the **Cookie** header value from the request headers
6. This is your session token

### 2. Configure your MCP client

Add to your MCP client config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "foodpanda": {
      "command": "node",
      "args": ["/path/to/foodpanda-mcp/build/index.js"],
      "env": {
        "FOODPANDA_SESSION_TOKEN": "your-session-token-here"
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

## Development

```bash
npm run dev    # Watch mode — recompiles on changes
npm run build  # One-time build
npm start      # Run the server
```

## Limitations

- **Session tokens expire.** You'll need to refresh your token periodically by repeating step 1.
- **No official API.** This server reverse-engineers foodpanda's internal web API. It may break if foodpanda changes their API.
- **Philippines only.** This server targets foodpanda.ph specifically.
- **Uses account defaults.** Delivery address and payment method come from your foodpanda account settings.
