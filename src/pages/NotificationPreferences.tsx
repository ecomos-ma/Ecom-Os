import { PageHeader } from "../components/PageHeader";
import NotificationSettingsTab from "./settings/components/NotificationSettingsTab";

export default function NotificationPreferences() {
  return (
    <div>
      <PageHeader title="Notification settings" subtitle="Manage alerts for your account in the current workspace." />
      <NotificationSettingsTab />
    </div>
  );
}
