import type {
  Restaurant,
  RestaurantDetails,
  MenuCategory,
  MenuItem,
  Cart,
  CartItem,
  OrderResult,
  AddToCartInput,
  CartProductPayload,
  CartVendorPayload,
  CartCalculateRequest,
  ToppingGroup,
  ScheduleEntry,
} from "./types.js";

const FOODPANDA_API_BASE = "https://ph.fd-api.com";
const GRAPHQL_SEARCH_HASH =
  "6d4dea2e0c8ab03c0d2934ca3db20b8914fc17e4109fb103307e4c077ba8506d";

/** Shared shape for vendor menu data from the REST API */
interface VendorMenuData {
  menu_categories: Array<{
    name: string;
    products: Array<{
      id: number;
      code: string;
      name: string;
      description: string;
      file_path: string;
      is_sold_out: boolean;
      product_variations: Array<{
        id: number;
        code: string;
        price: number;
        topping_ids: number[];
      }>;
    }>;
  }>;
  toppings: Record<
    string,
    {
      id: number;
      name: string;
      quantity_minimum: number;
      quantity_maximum: number;
      options: Array<{
        id: number;
        product_id: number;
        name: string;
        price: number;
      }>;
    }
  >;
}

/** Shape expected by cacheVendorMenu */
interface VendorMenuInput {
  code: string;
  name: string;
  latitude: number;
  longitude: number;
  menus: VendorMenuData[];
}

/**
 * Cached menu data per vendor, so we can build cart payloads
 * without re-fetching the menu every time.
 */
interface CachedVendorMenu {
  vendorCode: string;
  vendorName: string;
  vendorLatitude: number;
  vendorLongitude: number;
  categories: MenuCategory[];
  /** Flat lookup: product code -> MenuItem */
  productsByCode: Map<string, MenuItem>;
  /** Flat lookup: product id -> MenuItem */
  productsById: Map<number, MenuItem>;
}

export class FoodpandaClient {
  private sessionToken: string;
  private latitude: number;
  private longitude: number;
  private customerCode: string;

  // In-memory cart state (foodpanda cart is stateless / server recalculates)
  private cartProducts: CartProductPayload[] = [];
  private cartVendor: CartVendorPayload | null = null;
  private cartVendorName: string = "";
  private cartItems: CartItem[] = [];
  private cartSubtotal: number = 0;
  private cartDeliveryFee: number = 0;
  private cartServiceFee: number = 0;
  private cartTotal: number = 0;
  private nextCartItemId: number = 1;

  // Menu cache keyed by vendor code
  private menuCache: Map<string, CachedVendorMenu> = new Map();

  constructor(sessionToken: string, latitude: number, longitude: number) {
    this.sessionToken = sessionToken;
    this.latitude = latitude;
    this.longitude = longitude;
    this.customerCode = this.extractCustomerCode(sessionToken);
  }

  /**
   * Decode the JWT payload to extract user_id (customer code).
   * JWT format: header.payload.signature — payload is base64url-encoded JSON.
   */
  private extractCustomerCode(token: string): string {
    try {
      const parts = token.split(".");
      if (parts.length < 2) return "";
      // base64url -> base64
      let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      // pad to multiple of 4
      while (payload.length % 4 !== 0) payload += "=";
      const decoded = JSON.parse(Buffer.from(payload, "base64").toString());
      return decoded.user_id || "";
    } catch {
      return "";
    }
  }

  // ----------------------------------------------------------------
  // HTTP helpers
  // ----------------------------------------------------------------

  private commonHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.sessionToken}`,
      "x-fp-api-key": "volo",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
    };
  }

  private async restRequest<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${FOODPANDA_API_BASE}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.commonHeaders(),
        "x-pd-language-id": "1",
        "Content-Type": "application/json",
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Session token expired or invalid. Please refresh your token from the browser."
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Foodpanda API error (${response.status}): ${body.slice(0, 500)}`
      );
    }
    return response.json() as Promise<T>;
  }

  private async graphqlRequest<T>(body: object): Promise<T> {
    const url = `${FOODPANDA_API_BASE}/graphql`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...this.commonHeaders(),
        "Content-Type": "application/json",
        "customer-code": this.customerCode,
        "customer-latitude": String(this.latitude),
        "customer-longitude": String(this.longitude),
        platform: "web",
        locale: "en_PH",
      },
      body: JSON.stringify(body),
    });

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        "Session token expired or invalid. Please refresh your token from the browser."
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Foodpanda GraphQL error (${response.status}): ${text.slice(0, 500)}`
      );
    }
    return response.json() as Promise<T>;
  }

  // ----------------------------------------------------------------
  // 1. Search Restaurants
  // ----------------------------------------------------------------

  async searchRestaurants(
    query: string,
    _cuisine?: string,
    limit?: number
  ): Promise<Restaurant[]> {
    const body = {
      extensions: {
        persistedQuery: {
          sha256Hash: GRAPHQL_SEARCH_HASH,
          version: 1,
        },
      },
      variables: {
        searchResultsParams: {
          query,
          latitude: this.latitude,
          longitude: this.longitude,
          locale: "en_PH",
          languageId: 1,
          expeditionType: "DELIVERY",
          customerType: "B2C",
          verticalTypes: ["RESTAURANTS"],
        },
        skipQueryCorrection: true,
      },
    };

    interface GqlResponse {
      data: {
        searchPage: {
          components: Array<{
            vendorData?: {
              code: string;
              name: string;
              availability: {
                status: string;
                distanceInMeters: number;
              };
              vendorRating: {
                value: number;
                count: number;
              };
              dynamicPricing: {
                deliveryFee: { total: number };
                minimumOrderValue: { total: number };
              };
              timeEstimations: {
                delivery: {
                  duration: {
                    lowerLimitInMinutes: number;
                    upperLimitInMinutes: number;
                  };
                } | null;
              };
              vendorTile?: {
                vendorInfo?: Array<
                  Array<{
                    id: string;
                    elements: Array<{
                      text: string;
                    }>;
                  }>
                >;
              };
            };
          }>;
        };
      };
    }

    const result = await this.graphqlRequest<GqlResponse>(body);

    const components = result.data?.searchPage?.components || [];
    const restaurants: Restaurant[] = [];

    for (const comp of components) {
      const v = comp.vendorData;
      if (!v) continue;

      // Extract cuisines from vendorTile
      const cuisines: string[] = [];
      if (v.vendorTile?.vendorInfo) {
        for (const row of v.vendorTile.vendorInfo) {
          for (const group of row) {
            if (group.id === "VENDOR_INFO_CUISINES" && group.elements) {
              for (const el of group.elements) {
                if (el.text) cuisines.push(el.text);
              }
            }
          }
        }
      }

      const delivery = v.timeEstimations?.delivery?.duration;
      const deliveryTime = delivery
        ? `${delivery.lowerLimitInMinutes}-${delivery.upperLimitInMinutes} min`
        : "N/A";

      restaurants.push({
        id: v.code,
        name: v.name,
        cuisine: cuisines,
        rating: v.vendorRating?.value ?? 0,
        review_count: v.vendorRating?.count ?? 0,
        delivery_fee: v.dynamicPricing?.deliveryFee?.total ?? 0,
        delivery_time: deliveryTime,
        minimum_order: v.dynamicPricing?.minimumOrderValue?.total ?? 0,
        distance_km: Math.round((v.availability?.distanceInMeters ?? 0) / 100) / 10,
        is_open: v.availability?.status === "OPEN",
      });
    }

    const maxResults = limit ?? 10;
    return restaurants.slice(0, maxResults);
  }

  // ----------------------------------------------------------------
  // 2. Get Restaurant Details
  // ----------------------------------------------------------------

  async getRestaurantDetails(
    vendorCode: string
  ): Promise<RestaurantDetails> {
    const path =
      `/api/v5/vendors/${encodeURIComponent(vendorCode)}` +
      `?include=menus,bundles,multiple_discounts` +
      `&language_id=1&opening_type=delivery&basket_currency=PHP` +
      `&latitude=${this.latitude}&longitude=${this.longitude}`;

    interface VendorResponse {
      data: {
        code: string;
        name: string;
        address: string;
        rating: number;
        review_number: number;
        cuisines: Array<{ name: string; main: boolean }>;
        minimum_order_amount: number;
        minimum_delivery_fee: number;
        delivery_duration_range?: {
          lower_limit_in_minutes: number;
          upper_limit_in_minutes: number;
        };
        dynamic_pricing?: {
          delivery_fee?: { original: number };
          service_fee?: { total: number };
        };
        metadata?: { is_delivery_available: boolean };
        schedules: ScheduleEntry[];
        description: string;
        hero_image: string;
        logo: string;
        latitude: number;
        longitude: number;
        distance: number;
        menus?: VendorMenuData[];
      };
    }

    const result = await this.restRequest<VendorResponse>(path);
    const v = result.data;

    const cuisines = (v.cuisines || []).map((c) => c.name);
    const dr = v.delivery_duration_range;
    const deliveryTime = dr
      ? `${dr.lower_limit_in_minutes}-${dr.upper_limit_in_minutes} min`
      : "N/A";

    // Also cache the menu data while we have it
    if (v.menus && v.menus.length > 0) {
      this.cacheVendorMenu(v as VendorMenuInput);
    }

    return {
      id: v.code,
      name: v.name,
      cuisine: cuisines,
      rating: v.rating ?? 0,
      review_count: v.review_number ?? 0,
      delivery_fee: v.minimum_delivery_fee ?? 0,
      delivery_time: deliveryTime,
      minimum_order: v.minimum_order_amount ?? 0,
      distance_km: Math.round((v.distance ?? 0) * 10) / 10,
      is_open: v.metadata?.is_delivery_available ?? false,
      address: v.address ?? "",
      description: v.description ?? "",
      hero_image: v.hero_image ?? "",
      logo: v.logo ?? "",
      opening_hours: (v.schedules || []).map((s) => ({
        weekday: s.weekday,
        opening_type: s.opening_type,
        opening_time: s.opening_time,
        closing_time: s.closing_time,
      })),
      is_delivery_available: v.metadata?.is_delivery_available ?? false,
    };
  }

  // ----------------------------------------------------------------
  // 3. Get Menu
  // ----------------------------------------------------------------

  async getMenu(vendorCode: string): Promise<MenuCategory[]> {
    // Check cache first
    const cached = this.menuCache.get(vendorCode);
    if (cached) return cached.categories;

    // Fetch via the vendor details endpoint (includes menus)
    const path =
      `/api/v5/vendors/${encodeURIComponent(vendorCode)}` +
      `?include=menus,bundles,multiple_discounts` +
      `&language_id=1&opening_type=delivery&basket_currency=PHP` +
      `&latitude=${this.latitude}&longitude=${this.longitude}`;

    interface VendorMenuResponse {
      data: VendorMenuInput;
    }

    const result = await this.restRequest<VendorMenuResponse>(path);
    this.cacheVendorMenu(result.data);

    const cached2 = this.menuCache.get(vendorCode);
    return cached2 ? cached2.categories : [];
  }

  /**
   * Parse and cache menu data from a vendor API response.
   */
  private cacheVendorMenu(vendorData: VendorMenuInput): void {
    if (!vendorData.menus || vendorData.menus.length === 0) return;

    const menu = vendorData.menus[0];
    const toppingsDict = menu.toppings || {};
    const productsByCode = new Map<string, MenuItem>();
    const productsById = new Map<number, MenuItem>();

    const categories: MenuCategory[] = (menu.menu_categories || []).map(
      (cat) => {
        const items: MenuItem[] = (cat.products || []).map((prod) => {
          const variation = prod.product_variations?.[0];

          // Resolve topping groups for this product variation
          const toppingGroups: ToppingGroup[] = [];
          if (variation?.topping_ids) {
            for (const tId of variation.topping_ids) {
              const group = toppingsDict[String(tId)];
              if (group) {
                toppingGroups.push({
                  id: group.id,
                  name: group.name,
                  quantity_minimum: group.quantity_minimum,
                  quantity_maximum: group.quantity_maximum,
                  options: (group.options || []).map((opt) => ({
                    id: opt.id,
                    product_id: opt.product_id,
                    name: opt.name,
                    price: opt.price,
                  })),
                });
              }
            }
          }

          // Replace %s placeholder in image URL with 300
          const imageUrl = prod.file_path
            ? prod.file_path.replace("%s", "300")
            : "";

          const item: MenuItem = {
            id: prod.id,
            code: prod.code,
            name: prod.name,
            description: prod.description || "",
            price: variation?.price ?? 0,
            image_url: imageUrl,
            is_sold_out: prod.is_sold_out ?? false,
            variation: variation
              ? {
                  id: variation.id,
                  code: variation.code,
                  price: variation.price,
                }
              : { id: 0, code: "", price: 0 },
            topping_groups: toppingGroups,
          };

          productsByCode.set(prod.code, item);
          productsById.set(prod.id, item);
          return item;
        });

        return { name: cat.name, items };
      }
    );

    this.menuCache.set(vendorData.code, {
      vendorCode: vendorData.code,
      vendorName: vendorData.name,
      vendorLatitude: vendorData.latitude,
      vendorLongitude: vendorData.longitude,
      categories,
      productsByCode,
      productsById,
    });
  }

  // ----------------------------------------------------------------
  // 4. Add to Cart
  // ----------------------------------------------------------------

  async addToCart(
    vendorCode: string,
    items: AddToCartInput[]
  ): Promise<Cart> {
    // Ensure we have the menu cached for this vendor
    let cached = this.menuCache.get(vendorCode);
    if (!cached) {
      await this.getMenu(vendorCode);
      cached = this.menuCache.get(vendorCode);
      if (!cached) {
        throw new Error(
          `Could not load menu for vendor ${vendorCode}. The restaurant may not exist or may be unavailable.`
        );
      }
    }

    // If switching vendors, clear the cart
    if (this.cartVendor && this.cartVendor.code !== vendorCode) {
      this.clearCart();
    }

    // Set vendor info
    this.cartVendor = {
      code: vendorCode,
      latitude: cached.vendorLatitude,
      longitude: cached.vendorLongitude,
      marketplace: false,
      vertical: "restaurants",
    };
    this.cartVendorName = cached.vendorName;

    // Build product payloads for new items
    for (const input of items) {
      const product =
        cached.productsByCode.get(input.item_id) ||
        cached.productsById.get(Number(input.item_id));

      if (!product) {
        throw new Error(
          `Item "${input.item_id}" not found in menu for ${cached.vendorName}. Use get_menu to see available items.`
        );
      }

      // Build toppings payload
      const toppingsPayload: Array<{
        id: number;
        quantity: number;
        options: Array<{ id: number; quantity: number }>;
      }> = [];

      if (input.topping_ids && input.topping_ids.length > 0) {
        // Group selected option IDs by their topping group
        const selectedOptionIds = new Set(
          input.topping_ids.map((id) => Number(id))
        );

        for (const group of product.topping_groups) {
          const selectedOptions = group.options.filter((opt) =>
            selectedOptionIds.has(opt.id)
          );
          if (selectedOptions.length > 0) {
            toppingsPayload.push({
              id: group.id,
              quantity: 1,
              options: selectedOptions.map((opt) => ({
                id: opt.id,
                quantity: 1,
              })),
            });
          }
        }
      }

      const payload: CartProductPayload = {
        id: product.id,
        variation_id: product.variation.id,
        code: product.code,
        variation_code: product.variation.code,
        variation_name: product.name,
        quantity: input.quantity,
        price: product.variation.price,
        original_price: product.variation.price,
        packaging_charge: 0,
        vat_percentage: 0,
        special_instructions: input.special_instructions || "",
        sold_out_option: "REFUND",
        toppings: toppingsPayload,
        products: null,
        tags: null,
        menu_category_code: null,
        menu_category_id: null,
        menu_id: null,
        group_id: null,
        group_order_user_id: 0,
      };

      // Check if this product+variation already exists in cart
      const existingIdx = this.cartProducts.findIndex(
        (p) =>
          p.id === payload.id &&
          p.variation_id === payload.variation_id &&
          p.special_instructions === payload.special_instructions &&
          JSON.stringify(p.toppings) === JSON.stringify(payload.toppings)
      );

      if (existingIdx >= 0) {
        this.cartProducts[existingIdx].quantity += input.quantity;
      } else {
        this.cartProducts.push(payload);
      }
    }

    // Call cart/calculate to validate and get pricing
    return this.calculateCart();
  }

  // ----------------------------------------------------------------
  // 5. Get Cart
  // ----------------------------------------------------------------

  async getCart(): Promise<Cart | null> {
    if (this.cartProducts.length === 0 || !this.cartVendor) {
      return null;
    }

    return {
      restaurant_id: this.cartVendor.code,
      restaurant_name: this.cartVendorName,
      items: this.cartItems,
      subtotal: this.cartSubtotal,
      delivery_fee: this.cartDeliveryFee,
      service_fee: this.cartServiceFee,
      total: this.cartTotal,
    };
  }

  // ----------------------------------------------------------------
  // 6. Remove from Cart
  // ----------------------------------------------------------------

  async removeFromCart(cartItemId: string): Promise<Cart> {
    const idx = this.cartItems.findIndex((i) => i.cart_item_id === cartItemId);
    if (idx < 0) {
      throw new Error(
        `Cart item "${cartItemId}" not found. Use get_cart to see current items.`
      );
    }

    // Remove the corresponding product payload
    // Cart items and cart products are aligned by index
    this.cartProducts.splice(idx, 1);
    this.cartItems.splice(idx, 1);

    if (this.cartProducts.length === 0) {
      this.clearCart();
      return {
        restaurant_id: "",
        restaurant_name: "",
        items: [],
        subtotal: 0,
        delivery_fee: 0,
        service_fee: 0,
        total: 0,
      };
    }

    // Recalculate with remaining items
    return this.calculateCart();
  }

  // ----------------------------------------------------------------
  // 7. Place Order (NOT YET IMPLEMENTED)
  // ----------------------------------------------------------------

  async placeOrder(
    _paymentMethod?: string,
    _specialInstructions?: string
  ): Promise<OrderResult> {
    throw new Error(
      "Place order is not yet implemented. The checkout API has not been reverse-engineered yet."
    );
  }

  // ----------------------------------------------------------------
  // Cart calculation helper
  // ----------------------------------------------------------------

  private async calculateCart(): Promise<Cart> {
    if (!this.cartVendor || this.cartProducts.length === 0) {
      throw new Error("Cart is empty. Add items first.");
    }

    const requestBody: CartCalculateRequest = {
      products: this.cartProducts,
      vendor: this.cartVendor,
      expedition: {
        type: "delivery",
        delivery_option: "standard",
        latitude: this.latitude,
        longitude: this.longitude,
      },
      voucher: "",
      voucher_context: null,
      auto_apply_voucher: false,
      joker: { single_discount: true },
      joker_offer_id: "",
      payment: { version: 1 },
      group_order: null,
      source: "",
      order_time: "",
      participants: [],
      items: null,
    };

    interface CalculateResponse {
      products: Array<{
        id: number;
        variation_id: number;
        price: number;
        original_price: number;
        quantity: number;
        is_available: boolean;
        variation_name: string;
      }>;
      expedition: {
        delivery_fee: number;
        original_delivery_fee: number;
        selected_delivery_option?: {
          delivery_fee: number;
        };
      };
      payment: {
        subtotal: number;
        service_fee: number;
        total: number;
      };
    }

    const result = await this.restRequest<CalculateResponse>(
      "/api/v5/cart/calculate?include=expedition",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      }
    );

    // Update local cart state from server response
    this.cartSubtotal = result.payment?.subtotal ?? 0;
    this.cartServiceFee = result.payment?.service_fee ?? 0;
    this.cartTotal = result.payment?.total ?? 0;
    this.cartDeliveryFee =
      result.expedition?.selected_delivery_option?.delivery_fee ??
      result.expedition?.delivery_fee ??
      0;

    // Rebuild cartItems from the response + our stored payloads
    this.cartItems = this.cartProducts.map((payload, idx) => {
      const serverProduct = result.products?.[idx];
      const quantity = serverProduct?.quantity ?? payload.quantity;
      const unitPrice = serverProduct?.price ?? payload.price;

      // Resolve topping names from cached menu
      const toppingDetails: Array<{
        id: number;
        name: string;
        price: number;
      }> = [];
      const cached = this.menuCache.get(this.cartVendor!.code);
      if (cached) {
        for (const tGroup of payload.toppings) {
          for (const tOpt of tGroup.options) {
            // Find the topping option in the menu cache
            for (const cat of cached.categories) {
              for (const item of cat.items) {
                for (const group of item.topping_groups) {
                  if (group.id === tGroup.id) {
                    const opt = group.options.find((o) => o.id === tOpt.id);
                    if (opt) {
                      toppingDetails.push({
                        id: opt.id,
                        name: opt.name,
                        price: opt.price,
                      });
                    }
                  }
                }
              }
            }
          }
        }
      }

      return {
        cart_item_id: `cart-${idx + 1}`,
        product_id: payload.id,
        variation_id: payload.variation_id,
        code: payload.code,
        name: payload.variation_name,
        quantity,
        unit_price: unitPrice,
        total_price: unitPrice * quantity,
        toppings: toppingDetails,
        special_instructions: payload.special_instructions,
      };
    });

    // Re-index cart item IDs
    this.nextCartItemId = this.cartItems.length + 1;

    return {
      restaurant_id: this.cartVendor.code,
      restaurant_name: this.cartVendorName,
      items: this.cartItems,
      subtotal: this.cartSubtotal,
      delivery_fee: this.cartDeliveryFee,
      service_fee: this.cartServiceFee,
      total: this.cartTotal,
    };
  }

  private clearCart(): void {
    this.cartProducts = [];
    this.cartVendor = null;
    this.cartVendorName = "";
    this.cartItems = [];
    this.cartSubtotal = 0;
    this.cartDeliveryFee = 0;
    this.cartServiceFee = 0;
    this.cartTotal = 0;
    this.nextCartItemId = 1;
  }
}
