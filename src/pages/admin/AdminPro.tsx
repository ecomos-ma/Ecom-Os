import { useLocation } from "react-router-dom";
import { CommandCenter } from "./admin-pro/CommandCenter";
import { OrdersPage, UsersPage } from "./admin-pro/Management";
import { SupportPageV3 } from "./admin-pro/SupportV3";
import { OperationsPageV2 } from "./admin-pro/AdminOperations";
import { CommunicationsPageV3 } from "./admin-pro/CommunicationsV3";
import { PlatformSettingsPageV3 } from "./admin-pro/PlatformSettingsV3";
import { IntelligencePage } from "./admin-pro/InsightsControl";
import { AiToolsConsole } from "./admin-pro/AiToolsConsole";

export default function AdminPro() {
  const { pathname } = useLocation();

  if (pathname.startsWith("/admin/users")) return <UsersPage />;
  if (pathname.startsWith("/admin/workspaces")) return <UsersPage />;
  if (pathname.startsWith("/admin/orders")) return <OrdersPage />;
  if (pathname.startsWith("/admin/intelligence")) return <IntelligencePage />;
  if (pathname.startsWith("/admin/operations")) return <OperationsPageV2 />;
  if (pathname.startsWith("/admin/support")) return <SupportPageV3 />;
  if (pathname.startsWith("/admin/communications")) return <CommunicationsPageV3 />;
  if (pathname.startsWith("/admin/platform")) return <PlatformSettingsPageV3 />;
  if (pathname.startsWith("/admin/ai-tools")) return <AiToolsConsole />;
  return <CommandCenter />;
}
