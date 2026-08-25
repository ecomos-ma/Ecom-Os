import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <section className="max-w-lg text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">404</p>
        <h1 className="mt-4 text-4xl font-bold">This page does not exist</h1>
        <p className="mt-4 text-slate-400">The address may be outdated, or the page may have moved.</p>
        <Link
          to="/"
          className="mt-8 inline-flex rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        >
          Return to Ecom OS
        </Link>
      </section>
    </main>
  );
}
