export type ConfirmationAgent = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  role: string;
};

export type ConfirmationProduct = {
  id: string | null;
  name: string;
  sku: string | null;
  variant: string | null;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  stock: number | null;
};

export type ConfirmationOrder = {
  id: string;
  workspaceId: string;
  orderNumber: string;
  customerId: string | null;
  customerName: string;
  phone: string | null;
  city: string | null;
  address: string | null;
  total: number;
  status: string;
  deliveryStatus: string | null;
  shippingStatus: string | null;
  sku: string | null;
  productVariant: string | null;
  quantity: number;
  variantPrice: number | null;
  createdAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  assignedAgent: ConfirmationAgent | null;
  products: ConfirmationProduct[];
  lastActivity: ConfirmationTimelineEntry | null;
};

export type ConfirmationTimelineEntry = {
  id: string;
  type: string;
  source: "crm" | "order";
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  previousValue: string | null;
  nextValue: string | null;
  text: string;
  metadata: Record<string, unknown>;
};

export type ConfirmationNote = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string | null;
};

export type ConfirmationCallback = {
  id: string;
  scheduledAt: string;
  status: "scheduled" | "completed" | "cancelled";
  note: string | null;
  agentId: string;
  agentName: string | null;
  completedAt: string | null;
};

export type ConfirmationRecording = {
  id: string;
  orderId: string;
  storagePath: string | null;
  durationSeconds: number;
  mimeType: string | null;
  fileSize: number | null;
  recordingSource: "browser_microphone" | "telephony_provider";
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  expiredAt: string | null;
  agentId: string;
  agentName: string | null;
};

export type CustomerHistoryOrder = {
  id: string;
  orderNumber: string;
  productVariant: string | null;
  sku: string | null;
  total: number;
  status: string;
  deliveryStatus: string | null;
  createdAt: string;
};

export type ConfirmationOrderDetails = {
  order: ConfirmationOrder;
  notes: ConfirmationNote[];
  callbacks: ConfirmationCallback[];
  history: CustomerHistoryOrder[];
  timeline: ConfirmationTimelineEntry[];
  recordings: ConfirmationRecording[];
};

export type ConfirmationSummary = {
  totalOrders: number;
  ordersCreatedToday: number;
  confirmedToday: number;
  remainingOrders: number;
  statusCounts: Record<string, number>;
  callbacksDue: number;
  callbacksOverdue: number;
  callbacksToday: number;
  callsToday: number;
  actionsToday: number;
  handledToday: number;
};

export type ConfirmationOrderFilters = {
  page: number;
  pageSize: number;
  rawStatuses?: string[];
  search?: string;
  assignedAgentId?: string | null;
  myAgentId?: string | null;
  queue?: "all" | "my" | "unassigned" | "callback_due" | "recent";
  dateFrom?: string | null;
  dateTo?: string | null;
};
