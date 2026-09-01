import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";

export default function Terms() {
  const { mode } = useTheme();
  const isDark = mode === "dark";

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
      <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-cyan-500/10 blur-3xl" />
        <div className={`relative mx-auto max-w-4xl rounded-[32px] border ${isDark ? "border-slate-700/70 bg-slate-950/95" : "border-slate-200/70 bg-white/95"} p-8 shadow-2xl backdrop-blur-xl`}>
          <div className="mb-8 flex flex-col gap-4">
            <Link
              to="/login"
              className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${isDark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-slate-200"}`}
            >
              Back to Login
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-600 dark:text-pink-400">Terms of Service</p>
              <h1 className={`mt-4 text-4xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Terms and Conditions</h1>
              <p className={`mt-4 max-w-2xl text-base leading-7 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Welcome to Ecom OS. These terms govern your use of our platform, content, and services. By accessing or using Ecom OS, you agree to comply with these terms. Last updated: September 1, 2026.
              </p>
            </div>
          </div>

          <div className={`space-y-8 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>1. Acceptance of Terms</h2>
              <p className="leading-7 mb-2">
                By creating an account, accessing, or using Ecom OS ("the Service"), you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy. If you do not agree to these terms, do not use the Service.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>2. Service Description</h2>
              <p className="leading-7 mb-2">
                Ecom OS is a SaaS platform designed for e-commerce businesses to manage orders, customers, products, inventory, shipping, messaging, automation, and integrations. The Service includes:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Workspace management with team collaboration</li>
                <li>Order and customer data management</li>
                <li>Product inventory tracking</li>
                <li>Shipping and logistics integration</li>
                <li>Messaging and WhatsApp automation</li>
                <li>Third-party store and service integrations</li>
                <li>Analytics, reporting, and export features</li>
                <li>Admin and API access as configured by your plan</li>
              </ul>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>3. Account Responsibility</h2>
              <p className="leading-7 mb-2">
                You are responsible for:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Maintaining the confidentiality of your login credentials</li>
                <li>All activity that occurs under your account</li>
                <li>Ensuring that information you provide is accurate and lawful</li>
                <li>Notifying us immediately of unauthorized access or use</li>
                <li>Complying with applicable laws regarding data you upload to the Service</li>
              </ul>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>4. Acceptable Use</h2>
              <p className="leading-7 mb-2">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Engage in illegal activities or violate applicable laws</li>
                <li>Harass, threaten, defame, or harm others</li>
                <li>Transmit malware, viruses, or harmful code</li>
                <li>Attempt to gain unauthorized access to systems or accounts</li>
                <li>Reverse engineer, decompile, or extract the Service's source code</li>
                <li>Impersonate other users or misrepresent your identity</li>
                <li>Perform automated scraping without written permission</li>
                <li>Resell or redistribute access to the Service</li>
                <li>Engage in fraud, deception, or misleading practices</li>
              </ul>
              <p className="leading-7 mt-3">
                We reserve the right to suspend or terminate your account if you violate these terms. We may also report violations to relevant authorities.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>5. Subscriptions and Billing</h2>
              <p className="leading-7 mb-2">
                <strong>Subscription Plans:</strong> Your access to Ecom OS is determined by your selected plan. Each plan includes specific features, limits, and user counts. Exceeding your plan's limits may result in service restrictions or overage charges.
              </p>
              <p className="leading-7 mb-2">
                <strong>Payment Terms:</strong> You authorize us to charge your payment method on the subscription renewal date. Billing occurs at the frequency you selected (monthly or yearly). Prices are subject to change with at least 30 days' notice.
              </p>
              <p className="leading-7 mb-2">
                <strong>Refunds:</strong> See our Refund Policy for details on refund eligibility and procedures.
              </p>
              <p className="leading-7 mb-2">
                <strong>Cancellation:</strong> You may cancel your subscription at any time. Access continues until the end of your current billing period. No refunds are issued for unused time.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>6. Customer Data and Seller Responsibility</h2>
              <p className="leading-7 mb-2">
                When you import or input customer orders, contact information, and business data into Ecom OS, you represent that:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>You have the legal right to process this data</li>
                <li>You have obtained necessary customer consents and comply with privacy laws</li>
                <li>You will protect this data according to applicable regulations</li>
                <li>You are responsible for data retention and deletion policies</li>
              </ul>
              <p className="leading-7 mt-3">
                Ecom OS is a processor of your business data. You remain the data controller and responsible for legal compliance.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>7. Intellectual Property</h2>
              <p className="leading-7 mb-2">
                <strong>Your Content:</strong> You retain all rights to your business data, customer information, and uploaded content. By using the Service, you grant us a license to use, store, and process your data to provide the Service.
              </p>
              <p className="leading-7 mb-2">
                <strong>Ecom OS Content:</strong> All Service features, documentation, code, and materials are owned by Ecom OS or licensed to us. You may not reproduce, distribute, or publicly display this content without permission.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>8. Third-Party Integrations</h2>
              <p className="leading-7 mb-2">
                Ecom OS integrates with third-party services (stores, shipping providers, payment processors, messaging platforms, etc.). Your use of these integrations is governed by their respective terms and privacy policies. We are not responsible for:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Third-party service availability or performance</li>
                <li>Data handling by third-party providers</li>
                <li>Changes to third-party APIs or terms</li>
                <li>Unauthorized access to your credentials stored with third parties</li>
              </ul>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>9. Service Availability and Support</h2>
              <p className="leading-7 mb-2">
                <strong>No Guaranteed Uptime:</strong> While we strive to maintain service reliability, Ecom OS is provided on an "as-available" basis. We do not guarantee 100% uptime or absence of errors.
              </p>
              <p className="leading-7 mb-2">
                <strong>Maintenance:</strong> We may perform scheduled or emergency maintenance, which may result in temporary service interruption. We will attempt to notify you of scheduled maintenance in advance.
              </p>
              <p className="leading-7 mb-2">
                <strong>Support:</strong> Support availability depends on your subscription level. For support requests, contact support@ecomos.app.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>10. Limitation of Liability</h2>
              <p className="leading-7 mb-2">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, ECOM OS SHALL NOT BE LIABLE FOR:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-2">
                <li>Indirect, incidental, special, or consequential damages</li>
                <li>Loss of revenue, profit, or business opportunity</li>
                <li>Loss or corruption of data</li>
                <li>Service interruptions or downtime</li>
              </ul>
              <p className="leading-7 mt-3">
                Our total liability for any claim arising from the Service shall not exceed the fees you paid in the past 12 months.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>11. Disclaimer of Warranties</h2>
              <p className="leading-7">
                Ecom OS is provided "as-is" and "as-available" without warranties of any kind. We do not warrant that the Service will be error-free, uninterrupted, or secure. You use the Service at your own risk.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>12. Indemnification</h2>
              <p className="leading-7">
                You agree to indemnify and hold harmless Ecom OS from any claims, damages, or costs arising from your violation of these terms, your use of the Service, or your business data.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>13. Data Deletion and Account Termination</h2>
              <p className="leading-7 mb-2">
                <strong>Your Rights:</strong> You may request deletion of your personal data or account. See our Privacy Policy and Data Deletion Request process for details.
              </p>
              <p className="leading-7 mb-2">
                <strong>Our Right to Terminate:</strong> We may terminate your account if you violate these terms or fail to maintain an active subscription. Upon termination, access to your workspace and data ends.
              </p>
              <p className="leading-7 mb-2">
                <strong>Data Retention:</strong> We retain certain data for security, accounting, and legal compliance purposes, even after account deletion, as permitted by law.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>14. Modifications to Terms</h2>
              <p className="leading-7">
                We may update these terms from time to time. Material changes will be communicated to you via email or notification within the Service. Your continued use of the Service after updates constitutes acceptance of the new terms.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>15. Governing Law and Dispute Resolution</h2>
              <p className="leading-7 mb-2">
                These Terms are governed by the laws of Morocco. Any disputes shall first be subject to good-faith negotiation between the parties.
              </p>
              <p className="leading-7 mt-3">
                If you have questions about these terms, contact us at legal@ecomos.app.
              </p>
            </section>

            <div className={`mt-10 pt-6 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <strong>Version 1.0 · Last Updated September 1, 2026</strong>
              </p>
              <p className={`text-sm mt-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                By creating an account, you agree to these Terms and our{" "}
                <Link to="/privacy" className="font-semibold hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
