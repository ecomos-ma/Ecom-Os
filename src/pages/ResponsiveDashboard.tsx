import Dashboard from "./Dashboard";
import MobileDashboard from "./MobileDashboard";
import { usePhoneLayout } from "../hooks/usePhoneLayout";

export default function ResponsiveDashboard() {
  const isPhone = usePhoneLayout();

  return isPhone ? <MobileDashboard /> : <Dashboard />;
}
