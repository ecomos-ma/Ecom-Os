import type { Order, Customer, Product, Campaign, Expense, AdSpend, WorkspaceMember } from "../lib/types";
import {
  generateDemoCustomers,
  generateDemoOrders,
  generateDemoProducts,
  generateDemoCampaigns,
  generateDemoExpenses,
  generateDemoAdSpend,
  generateDemoTeam,
} from "./demoDataGenerators";
import { getDemoSession } from "./demoSession";

const DEMO_WORKSPACE_ID = "demo-workspace-001";

class DemoDataStore {
  private customers: Customer[] = [];
  private orders: Order[] = [];
  private products: Product[] = [];
  private campaigns: Campaign[] = [];
  private expenses: Expense[] = [];
  private adSpend: AdSpend[] = [];
  private team: WorkspaceMember[] = [];
  private initialized = false;

  initialize() {
    if (this.initialized) return;

    console.log("[DemoDataStore] Initializing demo data...");

    // Generate demo data
    this.customers = generateDemoCustomers(200, DEMO_WORKSPACE_ID);
    this.products = generateDemoProducts(DEMO_WORKSPACE_ID);
    this.campaigns = generateDemoCampaigns(DEMO_WORKSPACE_ID);
    this.orders = generateDemoOrders(500, DEMO_WORKSPACE_ID, this.customers, this.products, this.campaigns);
    this.expenses = generateDemoExpenses(50, DEMO_WORKSPACE_ID);
    this.adSpend = generateDemoAdSpend(90, DEMO_WORKSPACE_ID, this.campaigns);
    this.team = generateDemoTeam(DEMO_WORKSPACE_ID);

    this.initialized = true;
    console.log("[DemoDataStore] Demo data initialized:", {
      customers: this.customers.length,
      orders: this.orders.length,
      products: this.products.length,
      campaigns: this.campaigns.length,
      expenses: this.expenses.length,
      adSpend: this.adSpend.length,
      team: this.team.length,
    });
  }

  getCustomers(): Customer[] {
    this.ensureInitialized();
    return this.customers;
  }

  getOrders(): Order[] {
    this.ensureInitialized();
    return this.orders;
  }

  getProducts(): Product[] {
    this.ensureInitialized();
    return this.products;
  }

  getCampaigns(): Campaign[] {
    this.ensureInitialized();
    return this.campaigns;
  }

  getExpenses(): Expense[] {
    this.ensureInitialized();
    return this.expenses;
  }

  getAdSpend(): AdSpend[] {
    this.ensureInitialized();
    return this.adSpend;
  }

  getTeam(): WorkspaceMember[] {
    this.ensureInitialized();
    return this.team;
  }

  getOrderById(id: string): Order | undefined {
    this.ensureInitialized();
    return this.orders.find((o) => o.id === id);
  }

  getCustomerById(id: string): Customer | undefined {
    this.ensureInitialized();
    return this.customers.find((c) => c.id === id);
  }

  getOrdersByCustomerId(customerId: string): Order[] {
    this.ensureInitialized();
    return this.orders.filter((o) => o.customer_id === customerId);
  }

  updateOrder(orderId: string, updates: Partial<Order>): Order | null {
    this.ensureInitialized();
    const index = this.orders.findIndex((o) => o.id === orderId);
    if (index === -1) return null;

    this.orders[index] = { ...this.orders[index], ...updates };
    return this.orders[index];
  }

  updateCustomer(customerId: string, updates: Partial<Customer>): Customer | null {
    this.ensureInitialized();
    const index = this.customers.findIndex((c) => c.id === customerId);
    if (index === -1) return null;

    this.customers[index] = { ...this.customers[index], ...updates };
    return this.customers[index];
  }

  updateProduct(productId: string, updates: Partial<Product>): Product | null {
    this.ensureInitialized();
    const index = this.products.findIndex((p) => p.id === productId);
    if (index === -1) return null;

    this.products[index] = { ...this.products[index], ...updates };
    return this.products[index];
  }

  reset() {
    this.customers = [];
    this.orders = [];
    this.products = [];
    this.campaigns = [];
    this.expenses = [];
    this.adSpend = [];
    this.team = [];
    this.initialized = false;
    console.log("[DemoDataStore] Demo data reset");
  }

  private ensureInitialized() {
    if (!this.initialized) {
      this.initialize();
    }
  }
}

// Singleton instance
const demoDataStore = new DemoDataStore();

export function getDemoDataStore(): DemoDataStore {
  return demoDataStore;
}

export function resetDemoData() {
  demoDataStore.reset();
}

// Helper to check if we should use demo data
export function shouldUseDemoData(): boolean {
  return getDemoSession() !== null;
}
