import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTheme } from "../hooks/useTheme";
import { LegalFooter } from "./LegalFooter";

export function LegalPage({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children: ReactNode }) {
  const { mode } = useTheme();
  const isDark = mode === "dark";
  return (
    <div className={isDark ? "min-h-screen bg-slate-950 text-slate-200" : "min-h-screen bg-slate-50 text-slate-700"}>
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">Ecom OS</Link>
          <Link to="/contact" className="text-sm font-semibold text-pink-600 hover:underline dark:text-pink-400">Contact support</Link>
        </div>
        <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 dark:border-slate-800 dark:bg-slate-900">
          <header className="border-b border-slate-200 pb-8 dark:border-slate-800">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-600 dark:text-pink-400">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white">{title}</h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-600 dark:text-slate-400">{description}</p>
            <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-500">Last Updated: September 8, 2026</p>
          </header>
          <div className="prose prose-slate mt-8 max-w-none dark:prose-invert">{children}</div>
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}