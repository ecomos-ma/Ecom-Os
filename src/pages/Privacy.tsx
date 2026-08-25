import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";

export default function Privacy() {
  const { mode } = useTheme();

  return (
    <div className={`min-h-screen ${mode === "dark" ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-900"}`}>
      <div className="relative overflow-hidden py-12 px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-fuchsia-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl rounded-[32px] border border-slate-200/70 bg-white/95 p-8 shadow-2xl backdrop-blur-xl dark:border-slate-700/70 dark:bg-slate-950/95">
          <div className="mb-8 flex flex-col gap-4">
            <Link
              to="/login"
              className="inline-flex items-center rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to Login
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pink-600 dark:text-pink-400">Privacy Policy</p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">Privacy and Data Use</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-400">
                This Privacy Policy explains how Ecom Scale collects, uses, and protects your information when you use our platform.
              </p>
            </div>
          </div>

          <div className="space-y-8 text-slate-700 dark:text-slate-300">
            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">1. Information Collection</h2>
              <p className="leading-7">
                We collect information you provide directly, such as account details and authentication credentials, as well as usage data generated while using the platform.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">2. How We Use Data</h2>
              <p className="leading-7">
                Data is used to operate the service, improve features, and provide support. We do not sell personal information to third parties.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">3. Security</h2>
              <p className="leading-7">
                We use industry-standard practices to protect your data. However, no system is completely secure, and you also play a role in keeping your account safe.
              </p>
            </section>

            <section>
              <h2 className="mb-3 text-xl font-semibold text-slate-900 dark:text-white">4. Your Choices</h2>
              <p className="leading-7">
                You can update your account information and opt out of marketing communications where applicable. Contact support if you need help managing your data.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
