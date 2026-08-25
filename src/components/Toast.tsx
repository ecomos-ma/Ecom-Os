/**
 * Toast
 * -----
 * Lightweight, self-contained toast system.
 * Usage:
 *   import { toast } from "../components/Toast";
 *   toast.success("Commande sauvegardée !");
 *   toast.error("Erreur lors de la sauvegarde.");
 *
 * Mount <ToastContainer /> once in your Layout or App root.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, AlertCircle, Info, X } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type ToastKind = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** ms until auto-dismiss, default 3500 */
  duration?: number;
}

// ─── Internal event bus ───────────────────────────────────────────────────────

const listeners = new Set<(items: ToastItem[]) => void>();
let items: ToastItem[] = [];

function publish() { listeners.forEach((fn) => fn([...items])); }

function push(item: Omit<ToastItem, "id">) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  items = [...items, { ...item, id }];
  publish();

  const dur = item.duration ?? 3500;
  setTimeout(() => dismiss(id), dur);
  return id;
}

function dismiss(id: string) {
  items = items.filter((t) => t.id !== id);
  publish();
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const toast = {
  success: (message: string, duration?: number) => push({ kind: "success", message, duration }),
  error:   (message: string, duration?: number) => push({ kind: "error",   message, duration }),
  warning: (message: string, duration?: number) => push({ kind: "warning", message, duration }),
  info:    (message: string, duration?: number) => push({ kind: "info",    message, duration }),
  dismiss,
};

// ─── Container component ──────────────────────────────────────────────────────

const KIND_STYLES: Record<ToastKind, { wrapper: string; icon: React.ReactNode }> = {
  success: {
    wrapper: "bg-white dark:bg-[#121214] border border-gray-200 dark:border-green-500/30",
    icon:    <CheckCircle2 size={15} className="text-green-600 dark:text-green-400 shrink-0" />,
  },
  error: {
    wrapper: "bg-white dark:bg-[#121214] border border-gray-200 dark:border-red-500/30",
    icon:    <XCircle size={15} className="text-red-600 dark:text-red-400 shrink-0" />,
  },
  warning: {
    wrapper: "bg-white dark:bg-[#121214] border border-gray-200 dark:border-orange-500/30",
    icon:    <AlertCircle size={15} className="text-orange-600 dark:text-orange-400 shrink-0" />,
  },
  info: {
    wrapper: "bg-white dark:bg-[#121214] border border-gray-200 dark:border-blue-500/30",
    icon:    <Info size={15} className="text-blue-600 dark:text-blue-400 shrink-0" />,
  },
};

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (next: ToastItem[]) => setToasts(next);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      id="toast-container"
      aria-live="polite"
      className="fixed bottom-5 right-5 left-5 md:left-auto z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => {
        const { wrapper, icon } = KIND_STYLES[t.kind];
        return (
          <div
            key={t.id}
            className={`
              pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3
              text-[13px] font-medium shadow-toast-light dark:shadow-toast-dark
              backdrop-blur-sm animate-in slide-in-from-bottom-2 fade-in
              duration-200 min-w-[240px] max-w-full md:max-w-sm w-full md:w-auto
              ${wrapper}
            `}
          >
            {icon}
            <span className="flex-1 text-gray-900 dark:text-zinc-200 font-semibold">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              className="ml-1 text-gray-500 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded p-1 transition-all cursor-pointer"
              aria-label="Fermer"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
