// --- Public types exposed to MCP tool responses ---

export interface Restaurant {
  id: string; // vendor code, e.g. "p7nl"
  name: string;
  cuisine: string[];
  rating: number;
  review_count: number;
  delivery_fee: number;
  delivery_time: string; // e.g. "15-25 min"
  minimum_order: number;
  distance_km: number;
  is_open: boolean;
}

export interface RestaurantDetails extends Restaurant {
  address: string;
  description: string;
  hero_image: string;
  logo: string;
  opening_hours: ScheduleEntry[];
  is_delivery_available: boolean;
}

export interface ScheduleEntry {
  weekday: number; // 1=Monday ... 7=Sunday
  opening_type: string;
  opening_time: string;
  closing_time: string;
}

export interface MenuItem {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  image_url: string;
  is_sold_out: boolean;
  variation: {
    id: number;
    code: string;
    price: number;
  };
  topping_groups: ToppingGroup[];
}

export interface ToppingGroup {
  id: number;
  name: string;
  quantity_minimum: number;
  quantity_maximum: number;
  options: ToppingOption[];
}

export interface ToppingOption {
  id: number;
  product_id: number;
  name: string;
  price: number;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface CartItem {
  cart_item_id: string;
  product_id: number;
  variation_id: number;
  code: string;
  name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  toppings: CartItemTopping[];
  special_instructions: string;
}

export interface CartItemTopping {
  id: number;
  name: string;
  price: number;
}

export interface Cart {
  restaurant_id: string;
  restaurant_name: string;
  items: CartItem[];
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  total: number;
}

export interface OrderResult {
  order_id: string;
  status: string;
  estimated_delivery_time: string;
  total: number;
}

export interface AddToCartInput {
  item_id: string; // product code (e.g. "ct-36-pd-1673")
  quantity: number;
  variation_id?: string;
  topping_ids?: string[];
  special_instructions?: string;
}

// --- Internal types for cart calculation API payloads ---

export interface CartProductPayload {
  id: number;
  variation_id: number;
  code: string;
  variation_code: string;
  variation_name: string;
  quantity: number;
  price: number;
  original_price: number;
  packaging_charge: number;
  vat_percentage: number;
  special_instructions: string;
  sold_out_option: string;
  toppings: CartToppingPayload[];
  products: null;
  tags: null;
  menu_category_code: null;
  menu_category_id: null;
  menu_id: null;
  group_id: null;
  group_order_user_id: number;
}

export interface CartToppingPayload {
  id: number;
  quantity: number;
  options: CartToppingOptionPayload[];
}

export interface CartToppingOptionPayload {
  id: number;
  quantity: number;
}

export interface CartVendorPayload {
  code: string;
  latitude: number;
  longitude: number;
  marketplace: boolean;
  vertical: string;
}

export interface CartCalculateRequest {
  products: CartProductPayload[];
  vendor: CartVendorPayload;
  expedition: {
    type: string;
    delivery_option: string;
    latitude: number;
    longitude: number;
  };
  voucher: string;
  voucher_context: null;
  auto_apply_voucher: boolean;
  joker: { single_discount: boolean };
  joker_offer_id: string;
  payment: { version: number };
  group_order: null;
  source: string;
  order_time: string;
  participants: never[];
  items: null;
}
