import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";

export default function Terms() {
  const { mode } = useTheme();

  return (
    <div className={`min-h-screen ${mode === "dark" ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
      <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-fuchsia-500/10 via-transparent to-cyan-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl rounded-[32px] border border-slate-200/70 bg-white/95 p-8 shadow-2xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/95">
          <div className="mb-8 flex flex-col gap-4">
            <Link
              to="/login"
              className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to Login
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-600 dark:text-pink-400">Terms of Service</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">Terms and Conditions</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400">
                Welcome to Ecom Scale. These terms govern your use of our platform, content, and services. By accessing or using Ecom Scale, you agree to comply with these terms.
              </p>
            </div>
          </div>

          <div className="space-y-8 text-slate-700 dark:text-slate-300">
            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">1. Using the Service</h2>
              <p className="leading-7">
                You may use Ecom Scale for your business operations, analytics, and order management. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">2. Acceptable Use</h2>
              <p className="leading-7">
                Do not use the platform to engage in unlawful activity, distribute malware, or attempt to compromise the security of our systems. We reserve the right to suspend accounts that violate these terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">3. Updates and Changes</h2>
              <p className="leading-7">
                We may update these terms from time to time. Continued use of Ecom Scale after changes are posted constitutes acceptance of the revised terms.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">4. Limitation of Liability</h2>
              <p className="leading-7">
                Ecom Scale is provided as-is. We are not liable for indirect, incidental, or consequential damages arising from your use of the service.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
