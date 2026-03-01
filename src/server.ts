import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { FoodpandaClient } from "./foodpanda-client.js";

export function createServer(client: FoodpandaClient): McpServer {
  const server = new McpServer(
    {
      name: "foodpanda-mcp",
      version: "0.1.0",
    },
    {
      capabilities: { logging: {} },
    }
  );

  // --- search_restaurants ---
  server.registerTool(
    "search_restaurants",
    {
      title: "Search Restaurants",
      description:
        "Search for restaurants on foodpanda.ph near the configured delivery address. Returns a list of matching restaurants with id (vendor code), name, cuisine, rating, delivery fee, estimated delivery time, and minimum order amount.",
      inputSchema: z.object({
        query: z.string().describe("Search query (e.g. 'Jollibee', 'pizza', 'Thai food')"),
        cuisine: z.string().optional().describe("Filter by cuisine type"),
        limit: z.number().optional().describe("Max number of results (default 10)"),
      }),
    },
    async ({ query, cuisine, limit }) => {
      try {
        const restaurants = await client.searchRestaurants(query, cuisine, limit);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(restaurants, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error searching restaurants: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_restaurant_details ---
  server.registerTool(
    "get_restaurant_details",
    {
      title: "Get Restaurant Details",
      description:
        "Get detailed information about a specific restaurant including address, opening hours, minimum order, and delivery info.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The vendor code from search results (e.g. 'p7nl')"),
      }),
    },
    async ({ restaurant_id }) => {
      try {
        const details = await client.getRestaurantDetails(restaurant_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(details, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting restaurant details: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_menu ---
  server.registerTool(
    "get_menu",
    {
      title: "Get Menu",
      description:
        "Get the menu for a restaurant, organized by category. Returns a compact list with each item's code, name, price, and sold-out status. Use the item code when adding to cart. Use get_item_details if you need topping/customization options for a specific item.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The vendor code (e.g. 'p7nl')"),
      }),
    },
    async ({ restaurant_id }) => {
      try {
        const menu = await client.getMenu(restaurant_id);
        // Strip topping_groups to keep response compact
        const compact = menu.map((cat) => ({
          name: cat.name,
          items: cat.items.map((item) => ({
            code: item.code,
            name: item.name,
            price: item.price,
            description: item.description || undefined,
            is_sold_out: item.is_sold_out || undefined,
          })),
        }));
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(compact, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting menu: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_item_details ---
  server.registerTool(
    "get_item_details",
    {
      title: "Get Item Details",
      description:
        "Get full details for a menu item including all topping groups and customization options. Use this when you need to know what toppings/variations are available before adding to cart.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The vendor code (e.g. 'p7nl')"),
        item_code: z.string().describe("The product code from the menu (e.g. 'ct-36-pd-1673')"),
      }),
    },
    async ({ restaurant_id, item_code }) => {
      try {
        const menu = await client.getMenu(restaurant_id);
        for (const cat of menu) {
          const item = cat.items.find((i) => i.code === item_code);
          if (item) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify({ category: cat.name, ...item }, null, 2),
                },
              ],
            };
          }
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Item "${item_code}" not found in menu for restaurant "${restaurant_id}".`,
            },
          ],
          isError: true,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting item details: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- add_to_cart ---
  server.registerTool(
    "add_to_cart",
    {
      title: "Add to Cart",
      description:
        "Add one or more items to the cart. If items are from a different restaurant than the current cart, the cart is cleared first. Sends the full cart to foodpanda for price validation and returns updated totals.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The vendor code (e.g. 'p7nl')"),
        items: z
          .array(
            z.object({
              item_id: z.string().describe("Product code from the menu (e.g. 'ct-36-pd-1673')"),
              quantity: z.number().min(1).describe("Quantity to add"),
              variation_id: z
                .string()
                .optional()
                .describe("Variation ID (usually not needed — first variation is used by default)"),
              topping_ids: z
                .array(z.string())
                .optional()
                .describe("IDs of selected topping options from the menu's topping_groups"),
              special_instructions: z
                .string()
                .optional()
                .describe("Special instructions for this item"),
            })
          )
          .describe("Items to add to cart"),
      }),
    },
    async ({ restaurant_id, items }) => {
      try {
        const cart = await client.addToCart(restaurant_id, items);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(cart, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error adding to cart: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- get_cart ---
  server.registerTool(
    "get_cart",
    {
      title: "Get Cart",
      description:
        "View the current in-memory cart contents including items, quantities, prices, delivery fee, service fee, and totals. Returns 'Cart is empty.' if no items have been added.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const cart = await client.getCart();
        if (!cart) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Cart is empty.",
              },
            ],
          };
        }
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(cart, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error getting cart: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- remove_from_cart ---
  server.registerTool(
    "remove_from_cart",
    {
      title: "Remove from Cart",
      description: "Remove an item from the cart by its cart item ID (e.g. 'cart-1'). Re-calculates totals with remaining items.",
      inputSchema: z.object({
        cart_item_id: z.string().describe("The cart item ID to remove (e.g. 'cart-1', from get_cart results)"),
      }),
    },
    async ({ cart_item_id }) => {
      try {
        const cart = await client.removeFromCart(cart_item_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(cart, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error removing from cart: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- preview_order ---
  server.registerTool(
    "preview_order",
    {
      title: "Preview Order",
      description:
        "Preview the current cart as an order. Returns a summary of items, totals, delivery address, and available payment methods. IMPORTANT: After calling this, you MUST show the full summary to the user and ask them to explicitly confirm before calling place_order. Never place an order without user confirmation.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const preview = await client.previewOrder();
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(preview, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error previewing order: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // --- place_order ---
  server.registerTool(
    "place_order",
    {
      title: "Place Order",
      description:
        "Place the current cart as an order. You MUST call preview_order first and get explicit user confirmation before calling this. Supported payment methods: 'payment_on_delivery' (Cash on Delivery) and 'generic_creditcard' (saved credit card). The payment method name must match one from preview_order results.",
      inputSchema: z.object({
        payment_method: z
          .string()
          .describe(
            "Payment method name from preview_order results (e.g. 'payment_on_delivery' or 'generic_creditcard')"
          ),
        delivery_instructions: z
          .string()
          .optional()
          .describe("Special delivery instructions (e.g. 'Leave at door', 'Ring doorbell')"),
      }),
    },
    async ({ payment_method, delivery_instructions }) => {
      try {
        const result = await client.placeOrder(payment_method, delivery_instructions);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error placing order: ${(error as Error).message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}
