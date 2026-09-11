import { BrowserRouter, Navigate, Routes, Route, useLocation } from "react-router-dom";
import {
  lazy,
  Suspense,
  Component,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { AuthProvider } from "./hooks/useAuth";
import { WorkspaceScopeProvider } from "./contexts/WorkspaceScopeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { PermissionGuard } from "./components/PermissionGuard";
import { PlatformAdminRoute } from "./components/PlatformAdminRoute";
import { AdminProLayout } from "./components/AdminProLayout";
import { supabaseConfigurationError } from "./lib/supabase";
import { LanguageProvider } from "./i18n";
import { SupportModeProvider } from "./contexts/SupportModeContext";
import { SEOManager } from "./components/SEOManager";

const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));
const ChoosePlan = lazy(() => import("./pages/ChoosePlan"));
const Payment = lazy(() => import("./pages/Payment"));
const WaitingForVerification = lazy(
  () => import("./pages/WaitingForVerification"),
);
const SubscriptionExpired = lazy(() => import("./pages/SubscriptionExpired"));
const OAuthCallback = lazy(() => import("./pages/OAuthCallback"));
const Disabled = lazy(() => import("./pages/Disabled"));
const AccessDenied = lazy(() => import("./pages/AccessDenied"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const RefundPolicy = lazy(() => import("./pages/RefundPolicy"));
const DataDeletion = lazy(() => import("./pages/DataDeletion"));
const AccountDeletion = lazy(() => import("./pages/AccountDeletion"));
const CookiePolicy = lazy(() => import("./pages/CookiePolicy"));
const Security = lazy(() => import("./pages/Security"));
const Subprocessors = lazy(() => import("./pages/Subprocessors"));
const Contact = lazy(() => import("./pages/public/Contact"));
import { OrdersProvider } from "./contexts/OrdersContext";
import { NotificationProvider } from "./contexts/NotificationContext";
const EcomOSLanding = lazy(() => import("./pages/LandingV3"));

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Orders = lazy(() => import("./pages/Orders"));
const WhatsApp = lazy(() => import("./pages/WhatsApp"));
const LiveView = lazy(() => import("./pages/LiveView"));
const Confirmation = lazy(() => import("./pages/Confirmation"));
const Delivering = lazy(() => import("./pages/Delivering"));
const Shipping = lazy(() => import("./pages/Shipping"));
const Customers = lazy(() => import("./pages/Customers"));
const ProductsAndInventory = lazy(() => import("./pages/ProductsAndInventory"));
const ProductDetails = lazy(() => import("./pages/ProductDetails"));
const AdsManager = lazy(() => import("./pages/AdsManager"));
const LegacyAdsManager = lazy(() => import("./pages/LegacyAdsManager"));
const TikTokAds = lazy(() => import("./pages/TikTokAds"));
const Expenses = lazy(() => import("./pages/Expenses"));
const Finance = lazy(() => import("./pages/Finance"));
const CodScenarios = lazy(() => import("./pages/CodScenarios"));
const Team = lazy(() => import("./pages/Team"));
const Settings = lazy(() => import("./pages/Settings"));
const SetupWorkspace = lazy(() => import("./pages/SetupWorkspace"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Amine = lazy(() => import("./pages/AmineTools"));
const Invite = lazy(() => import("./pages/Invite"));

const AdminPro = lazy(() => import("./pages/admin/AdminPro"));
const PublicLandingPage = lazy(() => import("./pages/public/LandingPage"));

function LoadablePage({ children }: { children: ReactNode }) {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<PageSpinner />}>{children}</Suspense>
    </RouteErrorBoundary>
  );
}

function LegacySettingsTabRedirect({ tab }: { tab: string }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set("tab", tab);

  return <Navigate to={`/settings?${params.toString()}`} replace />;
}

class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[App] Route render failed", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-64 w-full place-items-center px-4 py-10">
          <section className="w-full max-w-md rounded-2xl border border-base-border bg-base-surface p-6 text-center shadow-card">
            <h1 className="text-lg font-bold text-ink">Unable to open this page</h1>
            <p className="mt-2 text-sm leading-6 text-ink-muted">
              The page did not load correctly. Refresh it to restore the latest app version.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 min-h-11 rounded-xl bg-brand-accent px-5 text-sm font-bold text-white"
            >
              Refresh page
            </button>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}

function PageSpinner() {
  return (
    <div className="flex h-32 w-full items-center justify-center">
      <div className="h-8 w-8 rounded-full border-2 border-brand-accent border-t-transparent animate-spin" />
    </div>
  );
}

export default function App() {
  if (supabaseConfigurationError) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <section className="mx-auto max-w-2xl rounded-2xl border border-amber-400/30 bg-slate-900 p-8 shadow-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-300">
            Configuration required
          </p>
          <h1 className="mt-3 text-3xl font-bold">
            Ecom OS cannot connect to Supabase
          </h1>
          <p className="mt-4 leading-7 text-slate-300">
            {supabaseConfigurationError}
          </p>
          <p className="mt-3 text-sm text-slate-400">
            Add the public Supabase URL and publishable key to this environment,
            then redeploy. Never add a service-role key to Vite variables.
          </p>
        </section>
      </main>
    );
  }

  return (
    <BrowserRouter>
      <WorkspaceScopeProvider>
        <AuthProvider>
          <SupportModeProvider>
            <LanguageProvider>
              <SEOManager />
              <Routes>
                <Route
                  path="/"
                  element={
                    <LoadablePage>
                      <EcomOSLanding />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/pricing"
                  element={
                    <LoadablePage>
                      <EcomOSLanding />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/features"
                  element={
                    <LoadablePage>
                      <EcomOSLanding />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/integrations"
                  element={
                    <LoadablePage>
                      <EcomOSLanding />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/login"
                  element={
                    <LoadablePage>
                      <Login />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/reset-password"
                  element={
                    <LoadablePage>
                      <ResetPassword />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/auth/callback"
                  element={
                    <LoadablePage>
                      <AuthCallback />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/choose-plan"
                  element={
                    <LoadablePage>
                      <ChoosePlan />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/payment"
                  element={
                    <LoadablePage>
                      <Payment />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/waiting-verification"
                  element={
                    <LoadablePage>
                      <WaitingForVerification />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/subscription-expired"
                  element={
                    <LoadablePage>
                      <SubscriptionExpired />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/disabled"
                  element={
                    <LoadablePage>
                      <Disabled />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/403"
                  element={
                    <LoadablePage>
                      <AccessDenied />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/404"
                  element={
                    <LoadablePage>
                      <NotFound />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/privacy"
                  element={
                    <LoadablePage>
                      <Privacy />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/terms"
                  element={
                    <LoadablePage>
                      <Terms />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/refund-policy"
                  element={
                    <LoadablePage>
                      <RefundPolicy />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/refund"
                  element={<Navigate to="/refund-policy" replace />}
                />
                <Route
                  path="/data-deletion"
                  element={
                    <LoadablePage>
                      <DataDeletion />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/account-deletion"
                  element={
                    <LoadablePage>
                      <AccountDeletion />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/cookie-policy"
                  element={
                    <LoadablePage>
                      <CookiePolicy />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/security"
                  element={
                    <LoadablePage>
                      <Security />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/subprocessors"
                  element={
                    <LoadablePage>
                      <Subprocessors />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/contact"
                  element={
                    <LoadablePage>
                      <Contact />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/landing-page/:id"
                  element={
                    <LoadablePage>
                      <PublicLandingPage />
                    </LoadablePage>
                  }
                />
                <Route
                  path="/invite"
                  element={
                    <LoadablePage>
                      <Invite />
                    </LoadablePage>
                  }
                />

                {/* Provider integration callbacks exchange provider codes server-side. */}
                <Route
                  path="/api/google/callback"
                  element={
                    <LoadablePage>
                      <OAuthCallback provider="google" />
                    </LoadablePage>
                  }
                />
                <Route
                  element={
                    <ProtectedRoute>
                      <OrdersProvider>
                        <NotificationProvider>
                          <Layout />
                        </NotificationProvider>
                      </OrdersProvider>
                    </ProtectedRoute>
                  }
                >
                  <Route
                    path="/dashboard"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="dashboard">
                          <Dashboard />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/setup"
                    element={
                      <LoadablePage>
                        <SetupWorkspace />
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/orders"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="orders">
                          <Orders />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/live-view"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="orders">
                          <LiveView />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/confirmation"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="confirmation">
                          <Confirmation />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/whatsapp"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="confirmation">
                          <WhatsApp />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/delivering"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="orders">
                          <Delivering />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/shipping"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="shipping">
                          <Shipping />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/customers"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="customers">
                          <Customers />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/products-inventory"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="products">
                          <ProductsAndInventory />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/products-inventory/:id"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="products">
                          <ProductDetails />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/ads-manager"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="ads">
                          <AdsManager />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/ads-manager-legacy"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="ads">
                          <LegacyAdsManager />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/tiktok-ads"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="tiktok_ads">
                          <TikTokAds />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/expenses"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="expenses">
                          <Expenses />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/finance"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="expenses">
                          <Finance />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/scenario"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="codscenarios">
                          <CodScenarios />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/cod-scenarios"
                    element={<Navigate to="/scenario" replace />}
                  />
                  <Route
                    path="/team"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="team">
                          <Team />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <LoadablePage>
                        <PermissionGuard permission="settings">
                          <Settings />
                        </PermissionGuard>
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/settings/integrations/*"
                    element={<LegacySettingsTabRedirect tab="integrations" />}
                  />
                  <Route
                    path="/settings/integration/*"
                    element={<LegacySettingsTabRedirect tab="integrations" />}
                  />
                  <Route
                    path="/settings/billing"
                    element={<LegacySettingsTabRedirect tab="billing" />}
                  />
                  <Route
                    path="/notifications"
                    element={
                      <LoadablePage>
                        <Notifications />
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/settings/notifications"
                    element={<LegacySettingsTabRedirect tab="notifications" />}
                  />
                  <Route
                    path="/tools"
                    element={
                      <LoadablePage>
                        <Amine />
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/amine"
                    element={
                      <LoadablePage>
                        <Amine />
                      </LoadablePage>
                    }
                  />
                  {/* Preserve legacy bookmarks without exposing a monetization screen. */}
                  <Route
                    path="/premium-dashboard"
                    element={<Navigate to="/dashboard" replace />}
                  />
                </Route>

                <Route
                  element={
                    <PlatformAdminRoute>
                      <AdminProLayout />
                    </PlatformAdminRoute>
                  }
                >
                  <Route
                    path="/admin"
                    element={
                      <LoadablePage>
                        <AdminPro />
                      </LoadablePage>
                    }
                  />
                  <Route
                    path="/admin/*"
                    element={
                      <LoadablePage>
                        <AdminPro />
                      </LoadablePage>
                    }
                  />
                </Route>

                {/* Permanent compatibility redirect: the old Super Admin surface has been retired. */}
                <Route
                  path="/super-admin/*"
                  element={<Navigate to="/admin" replace />}
                />
                <Route
                  path="*"
                  element={
                    <LoadablePage>
                      <NotFound />
                    </LoadablePage>
                  }
                />
              </Routes>
            </LanguageProvider>
          </SupportModeProvider>
        </AuthProvider>
      </WorkspaceScopeProvider>
    </BrowserRouter>
  );
}
