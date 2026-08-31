import { useLocation } from "react-router-dom";
import { CommandCenter } from "./admin-pro/CommandCenter";
import { OrdersPage, UsersPage } from "./admin-pro/Management";
import { SupportPageV3 } from "./admin-pro/SupportV3";
import { OperationsPageV2 } from "./admin-pro/AdminOperations";
import { CommunicationsPageV3 } from "./admin-pro/CommunicationsV3";
import { PlatformSettingsPageV3 } from "./admin-pro/PlatformSettingsV3";
import { IntelligencePage } from "./admin-pro/InsightsControl";
import { AiToolsConsole } from "./admin-pro/AiToolsConsole";
import { WorkspacesPage } from "./admin-pro/WorkspacesPage";
import { BillingPage } from "./admin-pro/BillingPage";
import { CampaignsPage, ProductsPage, SellersPage } from "./admin-pro/BusinessPages";
import { PaymentMethodsPage } from "./admin-pro/BankTransferSettings";

export default function AdminPro() {
  const { pathname } = useLocation();

  if (pathname.startsWith("/admin/users")) return <UsersPage />;
  if (pathname.startsWith("/admin/sellers")) return <SellersPage />;
  if (pathname.startsWith("/admin/workspaces")) return <WorkspacesPage />;
  if (pathname.startsWith("/admin/orders")) return <OrdersPage />;
  if (pathname.startsWith("/admin/products")) return <ProductsPage />;
  if (pathname.startsWith("/admin/campaigns")) return <CampaignsPage />;
  if (pathname.startsWith("/admin/payment-methods")) return <PaymentMethodsPage />;
  if (pathname.startsWith("/admin/subscriptions") || pathname.startsWith("/admin/payments")) return <BillingPage />;
  if (pathname.startsWith("/admin/plans")) return <BillingPage />;
  if (pathname.startsWith("/admin/intelligence")) return <IntelligencePage />;
  if (pathname.startsWith("/admin/operations")) return <OperationsPageV2 />;
  if (pathname.startsWith("/admin/support")) return <SupportPageV3 />;
  if (pathname.startsWith("/admin/announcements") || pathname.startsWith("/admin/communications")) return <CommunicationsPageV3 />;
  if (pathname.startsWith("/admin/platform")) return <PlatformSettingsPageV3 />;
  if (pathname.startsWith("/admin/ai-tools")) return <AiToolsConsole />;
  return <CommandCenter />;
}
