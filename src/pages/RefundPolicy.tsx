import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";

export default function RefundPolicy() {
  const { mode } = useTheme();
  const isDark = mode === "dark";

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
      <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-orange-500/10 blur-3xl" />
        <div className={`relative mx-auto max-w-4xl rounded-[32px] border ${isDark ? "border-slate-700/70 bg-slate-950/95" : "border-slate-200/70 bg-white/95"} p-8 shadow-2xl backdrop-blur-xl`}>
          <div className="mb-8 flex flex-col gap-4">
            <Link
              to="/login"
              className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${isDark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-slate-200"}`}
            >
              Back to Login
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-600 dark:text-pink-400">Refund Policy</p>
              <h1 className={`mt-4 text-4xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Subscription Refund Policy</h1>
              <p className={`mt-4 max-w-2xl text-base leading-7 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                This Refund Policy outlines how refund requests for Ecom OS subscriptions are handled. Last updated: September 1, 2026.
              </p>
            </div>
          </div>

          <div className={`space-y-8 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>1. Refund Eligibility</h2>
              
              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Eligible for Refund</h3>
              <p className="leading-7 mb-3">
                You may request a refund in the following cases:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li><strong>Duplicate Charge:</strong> Accidental duplicate subscription charges</li>
                <li><strong>Failed Payment:</strong> Payment was charged but subscription was not activated</li>
                <li><strong>Incorrect Amount:</strong> You were charged the wrong amount</li>
                <li><strong>Technical Error:</strong> A billing or system error caused an unauthorized charge</li>
                <li><strong>Unauthorized Use:</strong> A payment was made without your authorization</li>
              </ul>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Not Eligible for Refund</h3>
              <p className="leading-7 mb-3">
                Generally, refunds are not issued for:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Subscription renewals after you have used the Service during the billing period</li>
                <li>Voluntary cancellation after service activation</li>
                <li>Requests made more than 60 days after the charge</li>
                <li>Service dissatisfaction (unless caused by our error)</li>
                <li>Subscription upgrades or plan changes you requested</li>
              </ul>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>2. Payment Method Verification</h2>
              <p className="leading-7 mb-2">
                Some payment methods require verification before activation. When you submit payment proof:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Rejected or invalid proof does not result in subscription activation</li>
                <li>Your subscription remains inactive until valid proof is uploaded and approved</li>
                <li>Invalid charges may be reversed if payment was never approved</li>
                <li>Verification can take up to 3 business days</li>
              </ul>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>3. Refund Request Process</h2>
              
              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Requesting a Refund</h3>
              <p className="leading-7 mb-3">
                To request a refund:
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-2 mb-3">
                <li>Visit <strong>Settings › Billing › Request Refund</strong> (if applicable to your subscription)</li>
                <li>Provide your payment reference number and reason for the refund</li>
                <li>Include any supporting documentation (payment proof, duplicate charge evidence, etc.)</li>
                <li>Submit your request</li>
              </ol>
              <p className="leading-7 mb-3">
                Alternatively, you may email refund@ecomos.app with your request details.
              </p>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Review Process</h3>
              <p className="leading-7 mb-3">
                Your refund request will be:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Reviewed within 3-5 business days</li>
                <li>Evaluated against this refund policy</li>
                <li>Assessed based on available documentation</li>
                <li>Approved or declined with an explanation</li>
              </ul>
              <p className="leading-7 mb-3">
                You will receive a response email with the decision and next steps if applicable.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>4. Refund Processing</h2>
              
              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Approved Refunds</h3>
              <p className="leading-7 mb-3">
                If your refund is approved:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>The refund will be processed to your original payment method</li>
                <li>Processing time: 5-10 business days (depending on your bank)</li>
                <li>You will receive confirmation via email</li>
                <li>Your subscription may be cancelled or downgraded as applicable</li>
              </ul>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Declined Refunds</h3>
              <p className="leading-7 mb-3">
                If your refund request is declined, you will receive notification with the reason. You may appeal a decision by replying to the rejection email with additional information.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>5. Chargeback and Payment Dispute Prevention</h2>
              <p className="leading-7 mb-2">
                We encourage you to use our refund process before pursuing chargebacks or payment disputes. Benefits of using our process:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
                <li>Faster resolution (3-5 days vs. 30-60 days for chargebacks)</li>
                <li>Direct communication with our team</li>
                <li>Clear documentation and resolution</li>
                <li>Avoids payment disputes on your account history</li>
              </ul>
              <p className="leading-7 mt-3">
                <strong>Note:</strong> Filing a chargeback while a refund request is under review may result in automatic denial of your refund request.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>6. Cancellation vs. Refunds</h2>
              
              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Subscription Cancellation</h3>
              <p className="leading-7 mb-3">
                You can cancel your subscription at any time from the Billing section. Cancellation takes effect at the end of your current billing period. No partial refunds are issued for unused days in the current period.
              </p>

              <h3 className={`mt-4 mb-2 font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>Partial Period Refunds</h3>
              <p className="leading-7 mb-3">
                We do not issue prorated refunds for partial billing periods. If you cancel mid-month, your subscription remains active until the end of the billing month.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>7. Exceptional Cases</h2>
              <p className="leading-7 mb-2">
                In exceptional circumstances (extended service outage, critical bugs, etc.), Ecom OS may, at its discretion, issue refunds or service credits outside this standard policy. Such decisions are made on a case-by-case basis and are not precedent-setting.
              </p>
            </section>

            <section>
              <h2 className={`mb-3 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>8. Contact Support</h2>
              <p className="leading-7 mb-2">
                If you have questions about your subscription charge or need assistance:
              </p>
              <p className="leading-7">
                <strong>Email:</strong> support@ecomos.app<br />
                <strong>Refund Inquiries:</strong> refund@ecomos.app<br />
                <strong>Billing Support:</strong> billing@ecomos.app
              </p>
            </section>

            <div className={`mt-10 pt-6 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <strong>Version 1.0 · Last Updated September 1, 2026</strong>
              </p>
              <p className={`text-sm mt-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                See our <Link to="/terms" className="font-semibold hover:underline">Terms of Service</Link> and{" "}
                <Link to="/privacy" className="font-semibold hover:underline">Privacy Policy</Link> for more information.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
