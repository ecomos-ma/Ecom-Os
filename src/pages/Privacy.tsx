import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";

export default function Privacy() {
  const { mode } = useTheme();
  const isDark = mode === "dark";

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
      <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-fuchsia-500/10 blur-3xl" />
        <div className={`relative mx-auto max-w-4xl rounded-[32px] border ${isDark ? "border-slate-700/70 bg-slate-950/95" : "border-slate-200/70 bg-white/95"} p-8 shadow-2xl backdrop-blur-xl`}>
          <div className="mb-8 flex flex-col gap-4">
            <Link
              to="/login"
              className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${isDark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-slate-200"}`}
            >
              Back to Login
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-600 dark:text-pink-400">Privacy Policy</p>
              <h1 className={`mt-4 text-4xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Privacy and Data Use</h1>
              <p className={`mt-4 max-w-2xl text-base leading-7 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                This Privacy Policy explains how Ecom OS collects, uses, and protects your information when you use our platform. Last updated: September 1, 2026.
              </p>
            </div>
          </div>

          <div className={`space-y-8 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>1. Information We Collect</h2>
              
              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Account Information</h3>
              <p className="leading-7 mb-3">
                When you create an account, we collect your full name, email address, password, workspace name, and payment information. If you authenticate via Google, we receive your Google profile information as configured in your Google account settings.
              </p>
              
              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Business Data</h3>
              <p className="leading-7 mb-3">
                Ecom OS processes business data that you upload or create, including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Products, SKUs, prices, inventory levels, and stock information</li>
                <li>Workspace settings, configurations, and operational preferences</li>
                <li>Team member information and role assignments</li>
                <li>Subscription and billing preferences</li>
              </ul>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Customer and Order Data</h3>
              <p className="leading-7 mb-3">
                You control what customer and order information you store in Ecom OS. This may include:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Customer names, phone numbers, and email addresses</li>
                <li>Delivery addresses, cities, and location information</li>
                <li>Order details, product selections, and order status</li>
                <li>Payment status and delivery confirmation information</li>
                <li>Order tracking and fulfillment details</li>
              </ul>
              <p className="leading-7 mb-3 italic">
                <strong>Important:</strong> You are responsible for ensuring that you have proper rights to collect and process customer data, and that you comply with all applicable privacy and data protection laws.
              </p>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Integration Data</h3>
              <p className="leading-7 mb-3">
                When you connect third-party services (online stores, shipping providers, payment processors, advertising platforms, Google services, WhatsApp Business, etc.), Ecom OS may receive and process data as needed to provide these integrations. This includes:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Store credentials and access tokens (securely encrypted)</li>
                <li>Synced orders and customer information from connected stores</li>
                <li>Shipping and delivery information from logistics partners</li>
                <li>Advertising data and campaign performance metrics</li>
                <li>WhatsApp messaging and conversation data</li>
              </ul>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Usage and Diagnostic Data</h3>
              <p className="leading-7 mb-3">
                We collect usage data to improve Ecom OS, including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Features you use and how you interact with the platform</li>
                <li>Device type, browser type, and operating system</li>
                <li>Approximate location based on IP address (city/region level)</li>
                <li>Error and diagnostic logs to fix issues</li>
                <li>Performance metrics and application usage patterns</li>
              </ul>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Notifications and Preferences</h3>
              <p className="leading-7 mb-3">
                We collect information about your notification preferences, including browser push subscription endpoints, WhatsApp session information, and notification settings.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>2. How We Use Your Data</h2>
              <p className="leading-7 mb-2">
                Ecom OS uses your data for legitimate business purposes:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li><strong>Service Provision:</strong> To operate, maintain, and improve Ecom OS</li>
                <li><strong>Account Management:</strong> To create accounts, manage subscriptions, and provide support</li>
                <li><strong>Automation:</strong> To sync orders, process integrations, and execute automations you configure</li>
                <li><strong>Billing:</strong> To process payments and manage subscription renewals</li>
                <li><strong>Communications:</strong> To send you service updates, support responses, and account notifications</li>
                <li><strong>Analytics:</strong> To understand usage patterns and improve platform features</li>
                <li><strong>Security:</strong> To detect fraud, prevent abuse, and secure accounts</li>
                <li><strong>Legal Compliance:</strong> To comply with applicable laws and regulations</li>
              </ul>
              <p className="leading-7 mt-3">
                <strong>Advertising:</strong> Ecom OS does not sell your personal data or customer data to advertisers. We do not use personal data for targeted advertising.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>3. Data Sharing</h2>
              <p className="leading-7 mb-2">
                We share your data only when necessary:
              </p>
              <p className="leading-7 mb-3">
                <strong>Service Providers:</strong> We share data with third-party providers who assist with hosting, storage, payment processing, customer support, and analytics. These providers are contractually obligated to protect your data.
              </p>
              <p className="leading-7 mb-3">
                <strong>Integrations:</strong> When you authorize integrations with third-party services (stores, shipping providers, marketing platforms), Ecom OS may share necessary data with those services to enable the integration. You control which services can access your data.
              </p>
              <p className="leading-7 mb-3">
                <strong>Legal Requirements:</strong> We may disclose data if required by law, court order, or government request.
              </p>
              <p className="leading-7 mb-3">
                <strong>Business Transfers:</strong> If Ecom OS is acquired or merged, your data may be transferred as part of the transaction.
              </p>
              <p className="leading-7 mb-3">
                <strong>Seller Responsibility:</strong> Since you control customer data in Ecom OS, you remain responsible for its handling. Ecom OS acts as a data processor under your direction.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>4. Data Storage and Retention</h2>
              <p className="leading-7 mb-2">
                <strong>Active Accounts:</strong> Data is retained while your account is active and you maintain an active subscription.
              </p>
              <p className="leading-7 mb-2">
                <strong>After Deletion:</strong> After you request account or data deletion, we retain minimal data only where necessary for:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Security and fraud prevention purposes</li>
                <li>Financial and accounting requirements</li>
                <li>Legal and regulatory obligations</li>
                <li>Audit and administrative records</li>
              </ul>
              <p className="leading-7 mb-2">
                <strong>Infrastructure:</strong> Ecom OS uses cloud infrastructure providers (primarily Supabase/PostgreSQL) hosted in secure data centers. Your data may be geographically distributed for redundancy and backup purposes.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>5. Security</h2>
              <p className="leading-7 mb-2">
                Ecom OS implements industry-standard technical and organizational security measures, including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>HTTPS encryption for data in transit</li>
                <li>Encrypted storage for sensitive credentials and API keys</li>
                <li>Role-based access control and authentication</li>
                <li>Regular security updates and patches</li>
                <li>Activity logging and audit trails</li>
                <li>Third-party security monitoring</li>
              </ul>
              <p className="leading-7 mt-3">
                <strong>Limitations:</strong> No security system is perfect. While we work to protect your data, no guarantee can be made. You are also responsible for maintaining secure passwords and protecting your account credentials.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>6. Cookies and Browser Storage</h2>
              <p className="leading-7 mb-2">
                Ecom OS uses:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li><strong>Authentication Cookies:</strong> To maintain your login session securely</li>
                <li><strong>Browser Storage:</strong> To store temporary application state and user preferences locally on your device</li>
                <li><strong>Service Worker Cache:</strong> To enable offline access to the PWA</li>
              </ul>
              <p className="leading-7 mt-3">
                You can manage cookies and storage settings in your browser. Disabling these may impact platform functionality.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>7. Your Data Rights</h2>
              <p className="leading-7 mb-2">
                Depending on your location and applicable law, you may have the following rights:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li><strong>Access:</strong> Request a copy of your personal data</li>
                <li><strong>Correction:</strong> Update inaccurate information in your account</li>
                <li><strong>Deletion:</strong> Request deletion of your personal data (see Data Deletion Request process)</li>
                <li><strong>Portability:</strong> Request your data in a portable format</li>
                <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
              </ul>
              <p className="leading-7 mt-3">
                To exercise these rights, contact us at privacy@ecomos.app.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>8. International Data Transfers</h2>
              <p className="leading-7">
                Ecom OS may process data across multiple jurisdictions and countries. By using Ecom OS, you consent to international data processing where necessary to provide the Service. If you are located in the EU or other jurisdictions with data transfer restrictions, please contact us to discuss transfer mechanisms.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>9. Children's Data</h2>
              <p className="leading-7">
                Ecom OS is designed for business use and is not intended for children under 16 (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect data from children.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>10. Changes to This Policy</h2>
              <p className="leading-7">
                We may update this Privacy Policy from time to time. We will notify you of material changes via email or prominent notice within the Service. Your continued use of Ecom OS constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>11. Contact Us</h2>
              <p className="leading-7 mb-2">
                If you have questions about this Privacy Policy or data practices, contact us at:
              </p>
              <p className="leading-7">
                <strong>Email:</strong> privacy@ecomos.app<br />
                <strong>Email:</strong> legal@ecomos.app
              </p>
            </section>

            <div className={`mt-10 pt-6 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <strong>Version 1.0 · Last Updated September 1, 2026</strong>
              </p>
              <p className={`text-sm mt-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                See our <Link to="/terms" className="font-semibold hover:underline">Terms of Service</Link> for additional terms governing your use of Ecom OS.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
