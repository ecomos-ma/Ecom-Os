import { Link } from "react-router-dom";

const links = [
  ["Privacy Policy", "/privacy"],
  ["Terms of Service", "/terms"],
  ["Data Deletion", "/data-deletion"],
  ["Account Deletion", "/account-deletion"],
  ["Refund Policy", "/refund-policy"],
  ["Cookie Policy", "/cookie-policy"],
  ["Security", "/security"],
  ["Subprocessors", "/subprocessors"],
  ["Contact", "/contact"],
] as const;

export function LegalFooter() {
  return (
    <footer className="border-t border-slate-200/80 px-4 py-8 text-sm dark:border-slate-800">
      <nav aria-label="Legal" className="mx-auto flex max-w-5xl flex-wrap justify-center gap-x-5 gap-y-3">
        {links.map(([label, href]) => <Link key={href} to={href} className="text-slate-500 transition hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white">{label}</Link>)}
      </nav>
      <p className="mt-5 text-center text-xs text-slate-400">© {new Date().getFullYear()} Ecom OS. Last updated September 8, 2026.</p>
    </footer>
  );
}