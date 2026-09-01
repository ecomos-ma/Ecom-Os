import { Link } from "react-router-dom";
import { Mail, MessageCircle, MapPin, Clock } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";

export default function Contact() {
  const { mode } = useTheme();
  const isDark = mode === "dark";

  const contactChannels = [
    {
      icon: Mail,
      title: "Email Support",
      description: "Email our support team for general inquiries and technical issues",
      contact: "support@ecomos.app",
      responseTime: "Usually within 24 hours",
    },
    {
      icon: MessageCircle,
      title: "Legal Inquiries",
      description: "Contact us for legal, privacy, or compliance matters",
      contact: "legal@ecomos.app",
      responseTime: "Usually within 48 hours",
    },
    {
      icon: Mail,
      title: "Billing Support",
      description: "For subscription, payment, and refund inquiries",
      contact: "billing@ecomos.app",
      responseTime: "Usually within 24 hours",
    },
    {
      icon: Mail,
      title: "Refund Requests",
      description: "Submit or inquire about refund requests",
      contact: "refund@ecomos.app",
      responseTime: "Usually within 3 business days",
    },
  ];

  return (
    <div className={`min-h-screen ${isDark ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
      <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-cyan-500/10 blur-3xl" />
        
        <div className={`relative mx-auto max-w-4xl rounded-[32px] border ${isDark ? "border-slate-700/70 bg-slate-950/95" : "border-slate-200/70 bg-white/95"} p-8 shadow-2xl backdrop-blur-xl`}>
          <div className="mb-8 flex flex-col gap-4">
            <Link
              to="/login"
              className={`inline-flex items-center rounded-full border px-4 py-2 text-sm font-medium transition ${isDark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400 hover:bg-slate-200"}`}
            >
              Back to Login
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-600 dark:text-pink-400">Contact & Support</p>
              <h1 className={`mt-4 text-4xl font-semibold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Get in Touch</h1>
              <p className={`mt-4 max-w-2xl text-base leading-7 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                We're here to help. Reach out to our team for support, inquiries, or feedback.
              </p>
            </div>
          </div>

          <div className={`space-y-8 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            {/* Contact Channels */}
            <section>
              <h2 className={`mb-6 text-2xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Contact Channels</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {contactChannels.map((channel, idx) => {
                  const Icon = channel.icon;
                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border p-6 transition ${isDark ? "border-slate-700 hover:border-slate-600 hover:bg-slate-900/50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-pink-100/20 text-pink-600 dark:bg-pink-900/20">
                        <Icon size={18} />
                      </div>
                      <h3 className={`mb-2 font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                        {channel.title}
                      </h3>
                      <p className={`mb-3 text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                        {channel.description}
                      </p>
                      <div className={`mb-2 text-sm font-mono font-semibold ${isDark ? "text-pink-400" : "text-pink-600"}`}>
                        {channel.contact}
                      </div>
                      <div className={`flex items-center gap-1.5 text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
                        <Clock size={14} />
                        {channel.responseTime}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* FAQ Section */}
            <section>
              <h2 className={`mb-4 text-2xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Frequently Asked Questions</h2>
              
              <div className="space-y-4">
                <div className={`rounded-xl border p-5 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <h3 className={`mb-2 font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    What if I need immediate support?
                  </h3>
                  <p className={`text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    For urgent issues, email support@ecomos.app with "URGENT" in the subject line. We prioritize critical system issues and account access problems.
                  </p>
                </div>

                <div className={`rounded-xl border p-5 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <h3 className={`mb-2 font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    How do I request a refund?
                  </h3>
                  <p className={`text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Visit the <Link to="/refund-policy" className="font-semibold hover:underline">Refund Policy</Link> for eligibility and procedures. You can submit refund requests via Settings › Billing or email refund@ecomos.app.
                  </p>
                </div>

                <div className={`rounded-xl border p-5 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <h3 className={`mb-2 font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    How do I delete my account or data?
                  </h3>
                  <p className={`text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    You can request data or account deletion from Settings › Privacy. See our Privacy Policy for details on the process and data retention.
                  </p>
                </div>

                <div className={`rounded-xl border p-5 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <h3 className={`mb-2 font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    What if I have a privacy or legal concern?
                  </h3>
                  <p className={`text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    Contact our Legal team at legal@ecomos.app. For data protection inquiries, visit our <Link to="/privacy" className="font-semibold hover:underline">Privacy Policy</Link>.
                  </p>
                </div>

                <div className={`rounded-xl border p-5 ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                  <h3 className={`mb-2 font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                    What support is included with my plan?
                  </h3>
                  <p className={`text-sm leading-6 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                    All plans include email support. Response times and support priority may vary by plan. Check your billing details for your current support level.
                  </p>
                </div>
              </div>
            </section>

            {/* Response Times */}
            <section className={`rounded-xl border p-6 ${isDark ? "border-slate-700 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
              <h2 className={`mb-4 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Response Times</h2>
              <p className={`mb-4 leading-7 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                We aim to respond to all inquiries within the timeframes listed above. Response times may vary based on volume and issue complexity.
              </p>
              <ul className={`space-y-2 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                <li>• <strong>General Support:</strong> 24 hours</li>
                <li>• <strong>Billing Issues:</strong> 24 hours</li>
                <li>• <strong>Refund Requests:</strong> 3-5 business days</li>
                <li>• <strong>Legal Inquiries:</strong> 48 hours</li>
                <li>• <strong>Urgent Issues:</strong> As soon as possible (flagged for priority)</li>
              </ul>
            </section>

            {/* Other Resources */}
            <section>
              <h2 className={`mb-4 text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Other Resources</h2>
              <p className={`mb-4 leading-7 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                For more information about Ecom OS, please visit:
              </p>
              <ul className={`space-y-2 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                <li>
                  <Link to="/terms" className="font-semibold hover:underline">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="font-semibold hover:underline">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/refund-policy" className="font-semibold hover:underline">
                    Refund Policy
                  </Link>
                </li>
              </ul>
            </section>

            <div className={`mt-10 pt-6 border-t ${isDark ? "border-slate-700" : "border-slate-200"}`}>
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                <strong>Last Updated September 1, 2026</strong>
              </p>
              <p className={`text-sm mt-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Thank you for using Ecom OS. We're committed to providing excellent support.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
