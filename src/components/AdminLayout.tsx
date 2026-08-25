import { Outlet } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { Topbar } from "./Topbar";
import { PageContent } from "./PageContent";

export function AdminLayout() {
  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-base text-ink">
      <AdminSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
          <PageContent className="h-full min-h-full">
            <Outlet />
          </PageContent>
        </main>
      </div>
    </div>
  );
}
