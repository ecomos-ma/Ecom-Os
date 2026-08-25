import type { Order, Customer, Product, Campaign, Expense, AdSpend, WorkspaceMember } from "../lib/types";
import type { OrderStatus } from "../lib/types";

// Moroccan cities for realistic demo data
const MOROCCAN_CITIES = [
  "Casablanca",
  "Marrakech",
  "Rabat",
  "Tanger",
  "Agadir",
  "Fès",
  "Meknès",
  "Salé",
  "Oujda",
  "Tétouan",
  "Kénitra",
  "Taza",
  "El Jadida",
  "Safi",
  "Mohammedia",
  "Béni Mellal",
  "Nador",
  "Khouribga",
  "Settat",
  "Larache",
];

// Moroccan names
const MOROCCAN_NAMES = [
  "Youssef Benali", "Fatima Zahra", "Mohammed Amrani", "Amina Tazi", "Karim El Fassi",
  "Sara Idrissi", "Omar Bensaid", "Nour El Houda", "Ahmed Mansouri", "Leila Alaoui",
  "Reda Chraibi", "Samira Berrada", "Yassine El Idrissi", "Imane El Fenni", "Hamza Tazi",
  "Khadija Bennani", "Anas El Mansouri", "Meryem El Fassi", "Adil Berrada", "Hajar Idrissi",
  "Walid Benjelloun", "Nadia Amrani", "Zineb El Alaoui", "Karima Tazi", "Said Bensaid",
  "Rachid El Fassi", "Latifa Berrada", "Mounir Idrissi", "Souad El Alaoui", "Taha Benali",
  "Asmae Amrani", "Jalal El Fenni", "Naima Chraibi", "Abdelkader Tazi", "Khadija Bensaid",
  "Younes El Idrissi", "Fatiha Benjelloun", "Moulay Ahmed", "Samira El Fassi", "Nabil Berrada",
  "Rachida Amrani", "Abdelilah Tazi", "Aicha El Alaoui", "Mohamed El Fenni", "Halima Benali",
];

// Moroccan phone numbers (fake)
const generatePhone = (): string => {
  const prefixes = ["06", "07"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const rest = Math.floor(Math.random() * 90000000) + 10000000;
  return `${prefix}${rest}`;
};

// Order statuses with realistic distribution
const ORDER_STATUSES: OrderStatus[] = [
  "pending", "confirmed", "shipped", "delivered", "returned", "cancelled",
  "no_answer", "scheduled", "blacklisted", "duplicate", "unreachable",
  "wrong_number", "out_of_stock", "refused", "new"
];

const ORDER_STATUS_WEIGHTS = {
  pending: 0.15,
  confirmed: 0.20,
  shipped: 0.15,
  delivered: 0.25,
  returned: 0.05,
  cancelled: 0.08,
  no_answer: 0.04,
  scheduled: 0.03,
  blacklisted: 0.01,
  duplicate: 0.01,
  unreachable: 0.02,
  wrong_number: 0.01,
  out_of_stock: 0.01,
  refused: 0.03,
  new: 0.01,
};

// Shipping statuses
const SHIPPING_STATUSES = [
  "NEW_PARCEL", "WAITING_PICKUP", "PICKED_UP", "RECEIVED_AT_WAREHOUSE",
  "IN_DISTRIBUTION", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED",
  "REFUSED", "CANCELLED", "RETURN_TO_DEPOT", "RETURNED_TO_SENDER"
];

// Demo products
const DEMO_PRODUCTS: Omit<Product, "id" | "workspace_id" | "created_at">[] = [
  {
    name: "Nura Joint Cream",
    sku: "NURA-JC-001",
    cost: 45,
    price: 149,
    stock: 250,
    low_stock_threshold: 50,
    status: "active",
  },
  {
    name: "Abaya Nura",
    sku: "NURA-AB-001",
    cost: 120,
    price: 299,
    stock: 180,
    low_stock_threshold: 30,
    status: "active",
  },
  {
    name: "Portable Blender",
    sku: "BLN-PT-001",
    cost: 85,
    price: 199,
    stock: 95,
    low_stock_threshold: 20,
    status: "active",
  },
  {
    name: "Posture Corrector",
    sku: "POST-PC-001",
    cost: 35,
    price: 129,
    stock: 320,
    low_stock_threshold: 60,
    status: "active",
  },
  {
    name: "Hair Serum",
    sku: "HAIR-SR-001",
    cost: 55,
    price: 179,
    stock: 15,
    low_stock_threshold: 25,
    status: "active",
  },
  {
    name: "Mini Vacuum",
    sku: "VAC-MN-001",
    cost: 70,
    price: 189,
    stock: 0,
    low_stock_threshold: 30,
    status: "active",
  },
  {
    name: "Face Massager",
    sku: "FACE-FM-001",
    cost: 25,
    price: 99,
    stock: 450,
    low_stock_threshold: 80,
    status: "active",
  },
  {
    name: "LED Mask",
    sku: "LED-MK-001",
    cost: 95,
    price: 249,
    stock: 65,
    low_stock_threshold: 15,
    status: "active",
  },
];

// Demo campaigns
const DEMO_CAMPAIGNS: Omit<Campaign, "id" | "workspace_id" | "created_at">[] = [
  {
    name: "Nura Cream | Broad | CBO",
    platform: "meta",
  },
  {
    name: "Nura Cream | Retargeting",
    platform: "meta",
  },
  {
    name: "Abaya Nura | Women 25-54",
    platform: "meta",
  },
  {
    name: "Testing Creatives | ABO",
    platform: "meta",
  },
  {
    name: "Winning Creative Scale",
    platform: "meta",
  },
];

// Demo team members
const DEMO_TEAM: Omit<WorkspaceMember, "id" | "workspace_id" | "created_at" | "updated_at">[] = [
  {
    auth_user_id: "demo-owner-001",
    email: "amine@nura.ma",
    full_name: "Amine",
    role: "owner",
    status: "active",
    allowed_sections: ["Dashboard", "Orders", "Confirmation", "Shipping", "Customers", "Products", "Inventory", "Ads Manager", "Expenses", "COD Scenarios", "Analytics", "Team", "Settings"],
    invited_by: null,
    joined_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    last_login_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    auth_user_id: "demo-agent-001",
    email: "sara@nura.ma",
    full_name: "Sara",
    role: "agent",
    status: "active",
    allowed_sections: ["Dashboard", "Orders", "Confirmation", "Customers"],
    invited_by: "demo-owner-001",
    joined_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    last_login_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
  {
    auth_user_id: "demo-agent-002",
    email: "yassine@nura.ma",
    full_name: "Yassine",
    role: "agent",
    status: "active",
    allowed_sections: ["Dashboard", "Orders", "Confirmation", "Customers"],
    invited_by: "demo-owner-001",
    joined_at: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    last_login_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    auth_user_id: "demo-agent-003",
    email: "imane@nura.ma",
    full_name: "Imane",
    role: "agent",
    status: "active",
    allowed_sections: ["Dashboard", "Orders", "Confirmation", "Customers"],
    invited_by: "demo-owner-001",
    joined_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    last_login_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    auth_user_id: "demo-agent-004",
    email: "hamza@nura.ma",
    full_name: "Hamza",
    role: "agent",
    status: "active",
    allowed_sections: ["Dashboard", "Orders", "Confirmation", "Customers"],
    invited_by: "demo-owner-001",
    joined_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    last_login_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
];

// Helper: weighted random selection
function weightedRandom<T>(items: T[], weights: Record<string, number>): T {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  let random = Math.random() * totalWeight;
  
  for (let i = 0; i < items.length; i++) {
    const weight = weights[items[i] as string] || 0;
    if (random < weight) {
      return items[i];
    }
    random -= weight;
  }
  
  return items[0];
}

// Helper: generate random date within range
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

// Helper: generate tracking number
function generateTrackingNumber(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Generate demo customers
export function generateDemoCustomers(count: number, workspaceId: string): Customer[] {
  const customers: Customer[] = [];
  const usedNames = new Set<string>();
  
  for (let i = 0; i < count; i++) {
    let name: string;
    do {
      name = MOROCCAN_NAMES[Math.floor(Math.random() * MOROCCAN_NAMES.length)];
    } while (usedNames.has(name) && usedNames.size < MOROCCAN_NAMES.length);
    
    usedNames.add(name);
    
    customers.push({
      id: `demo-customer-${i + 1}`,
      workspace_id: workspaceId,
      name,
      phone: generatePhone(),
      city: MOROCCAN_CITIES[Math.floor(Math.random() * MOROCCAN_CITIES.length)],
      created_at: randomDate(
        new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        new Date()
      ).toISOString(),
    });
  }
  
  return customers;
}

// Generate demo orders
export function generateDemoOrders(
  count: number,
  workspaceId: string,
  customers: Customer[],
  products: Product[],
  campaigns: Campaign[]
): Order[] {
  const orders: Order[] = [];
  const now = new Date();
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < count; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
    const status = weightedRandom(ORDER_STATUSES, ORDER_STATUS_WEIGHTS);
    
    const orderDate = randomDate(startDate, now);
    const confirmedAt = (status === "confirmed" || status === "shipped" || status === "delivered") 
      ? randomDate(orderDate, new Date(orderDate.getTime() + 2 * 24 * 60 * 60 * 1000)).toISOString()
      : null;
    const deliveredAt = status === "delivered"
      ? randomDate(
          new Date(confirmedAt || orderDate),
          new Date()
        ).toISOString()
      : null;
    const cancelledAt = status === "cancelled"
      ? randomDate(orderDate, new Date(orderDate.getTime() + 24 * 60 * 60 * 1000)).toISOString()
      : null;
    
    const hasTracking = ["shipped", "delivered", "in_transit", "out_for_delivery"].includes(status) || 
                      Math.random() > 0.5;
    
    orders.push({
      id: `demo-order-${i + 1}`,
      workspace_id: workspaceId,
      order_number: `ORD-${String(i + 1).padStart(6, "0")}`,
      customer_id: customer.id,
      customer_name: customer.name,
      city: customer.city,
      total: product.price,
      status,
      delivery_status: hasTracking 
        ? SHIPPING_STATUSES[Math.floor(Math.random() * SHIPPING_STATUSES.length)]
        : null,
      campaign_id: campaign.id,
      created_at: orderDate.toISOString(),
      confirmed_at: confirmedAt,
      delivered_at: deliveredAt,
      cancelled_at: cancelledAt,
      tracking_number: hasTracking ? generateTrackingNumber() : null,
      shipment_id: hasTracking ? `demo-shipment-${i + 1}` : null,
      shipping_provider: hasTracking ? "coliaty" : null,
      phone: customer.phone,
      address: `${Math.floor(Math.random() * 999) + 1} Rue, ${customer.city}`,
      variant_price: product.price,
      sku: product.sku,
      product_variant: "Default",
      source: Math.random() > 0.3 ? "youcan" : "manual",
      customer,
      campaign,
    });
  }
  
  return orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

// Generate demo products
export function generateDemoProducts(workspaceId: string): Product[] {
  return DEMO_PRODUCTS.map((product, index) => ({
    ...product,
    id: `demo-product-${index + 1}`,
    workspace_id: workspaceId,
    created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

// Generate demo campaigns
export function generateDemoCampaigns(workspaceId: string): Campaign[] {
  return DEMO_CAMPAIGNS.map((campaign, index) => ({
    ...campaign,
    id: `demo-campaign-${index + 1}`,
    workspace_id: workspaceId,
    created_at: new Date(Date.now() - (60 - index * 10) * 24 * 60 * 60 * 1000).toISOString(),
  }));
}

// Generate demo expenses
export function generateDemoExpenses(count: number, workspaceId: string): Expense[] {
  const categories = [
    "Packaging", "Freelancer", "Creative production", "Warehouse", 
    "Software", "Internet", "Miscellaneous", "Marketing", "Shipping"
  ];
  const descriptions: Record<string, string[]> = {
    Packaging: ["Boxes and bubble wrap", "Labels and tape", "Packaging materials"],
    Freelancer: ["Graphic design", "Video editing", "Copywriting"],
    "Creative production": ["Product photography", "Video ads", "Creative testing"],
    Warehouse: ["Rent", "Utilities", "Staff"],
    Software: ["EcomOS subscription", "Design tools", "Analytics tools"],
    Internet: ["Office internet", "Mobile data"],
    Miscellaneous: ["Office supplies", "Coffee and snacks", "Transport"],
    Marketing: ["Influencer collaboration", "Ad spend boost", "Promotional materials"],
    Shipping: ["Carrier fees", "Return shipping", "Express delivery"],
  };
  
  const expenses: Expense[] = [];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < count; i++) {
    const category = categories[Math.floor(Math.random() * categories.length)];
    const categoryDescriptions = descriptions[category];
    const description = categoryDescriptions[Math.floor(Math.random() * categoryDescriptions.length)];
    
    expenses.push({
      id: `demo-expense-${i + 1}`,
      workspace_id: workspaceId,
      category,
      description,
      amount: Math.floor(Math.random() * 5000) + 100,
      date: randomDate(startDate, new Date()).toISOString(),
      created_at: new Date().toISOString(),
    });
  }
  
  return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Generate demo ad spend
export function generateDemoAdSpend(count: number, workspaceId: string, campaigns: Campaign[]): AdSpend[] {
  const adSpend: AdSpend[] = [];
  const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < count; i++) {
    const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
    const date = randomDate(startDate, new Date());
    
    adSpend.push({
      id: `demo-adspend-${i + 1}`,
      workspace_id: workspaceId,
      campaign_id: campaign.id,
      date: date.toISOString(),
      amount: Math.floor(Math.random() * 2000) + 200,
    });
  }
  
  return adSpend.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Generate demo team members
export function generateDemoTeam(workspaceId: string): WorkspaceMember[] {
  return DEMO_TEAM.map((member, index) => ({
    ...member,
    id: `demo-member-${index + 1}`,
    workspace_id: workspaceId,
    created_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }));
}
