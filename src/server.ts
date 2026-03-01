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
        "Get the full menu for a restaurant, organized by category. Each item includes id, code, name, description, price, image URL, and available topping groups with options. Use item codes or ids when adding to cart.",
      inputSchema: z.object({
        restaurant_id: z.string().describe("The vendor code (e.g. 'p7nl')"),
      }),
    },
    async ({ restaurant_id }) => {
      try {
        const menu = await client.getMenu(restaurant_id);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(menu, null, 2),
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

  // --- place_order ---
  server.registerTool(
    "place_order",
    {
      title: "Place Order",
      description:
        "[NOT YET AVAILABLE] Place the current cart as an order. This feature is not yet implemented — the checkout API has not been reverse-engineered. Calling this tool will return an error.",
      inputSchema: z.object({
        payment_method: z
          .string()
          .optional()
          .describe("Payment method to use (uses account default if not specified)"),
        special_instructions: z
          .string()
          .optional()
          .describe("Special delivery instructions"),
      }),
    },
    async ({ payment_method, special_instructions }) => {
      try {
        const result = await client.placeOrder(payment_method, special_instructions);
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
