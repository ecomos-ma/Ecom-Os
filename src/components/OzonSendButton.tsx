import { useEffect, useRef, useState } from "react";

type SendState = "idle" | "sending" | "success" | "error";

interface OzonSendButtonProps {
  /** Do the actual work, return true on success, false on failure */
  onSend: () => Promise<boolean>;
  disabled?: boolean;
  idleLabel?: string;
  sendingLabel?: string;
  successLabel?: string;
  errorLabel?: string;
}

export function OzonSendButton({
  onSend,
  disabled,
  idleLabel = "Send to Ozon",
  sendingLabel = "Sending to Ozon…",
  successLabel = "Sent!",
  errorLabel = "Failed — retry",
}: OzonSendButtonProps) {
  const [state, setState] = useState<SendState>("idle");
  const resetTimer = useRef<number>();

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const handleClick = async () => {
    if (state === "sending") return;
    setState("sending");
    let ok = false;
    try {
      ok = await onSend();
    } catch {
      ok = false;
    }
    setState(ok ? "success" : "error");
    resetTimer.current = window.setTimeout(() => setState("idle"), ok ? 2200 : 1800);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "sending"}
      data-state={state}
      className={`ozon-truck-btn inline-flex h-[36px] items-center gap-2 rounded-lg border px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${state}`}
    >
      <span className="ozon-truck-stage">
        {/* Sleek Minimalist Truck Icon */}
        <svg className="ozon-truck" viewBox="0 0 48 24" aria-hidden="true">
          <rect x="2" y="8" width="20" height="10" rx="2" className="truck-body" />
          <path d="M22 10h6.5l4.5 5v3h-11z" className="truck-cab" />
          <rect x="24.5" y="11.5" width="4.5" height="3.5" rx="0.5" className="truck-window" />
          <circle cx="8" cy="19" r="2.5" className="truck-wheel" />
          <circle cx="28" cy="19" r="2.5" className="truck-wheel" />
        </svg>
        <span className="ozon-speed-lines">
          <span />
          <span />
          <span />
        </span>
        <svg className="ozon-check" viewBox="0 0 24 24" aria-hidden="true">
          <path
            className="ozon-check-path"
            d="M4 12.5l5 5L20 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <span className="ozon-truck-label tracking-wide">
        {state === "idle" && idleLabel}
        {state === "sending" && sendingLabel}
        {state === "success" && successLabel}
        {state === "error" && errorLabel}
      </span>

      <style>{`
        .ozon-truck-btn {
          position: relative;
          background: linear-gradient(180deg, #18191c 0%, #09090b 100%);
          border-color: #27272a;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
          color: #fafafa;
        }
        .ozon-truck-btn.success { 
          background: linear-gradient(180deg, #10b981 0%, #059669 100%); 
          border-color: #047857; 
          box-shadow: 0 1px 2px rgba(5, 150, 105, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }
        .ozon-truck-btn.error { 
          background: linear-gradient(180deg, #ef4444 0%, #dc2626 100%); 
          border-color: #b91c1c; 
          box-shadow: 0 1px 2px rgba(220, 38, 38, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2);
        }
        .ozon-truck-btn:not(:disabled):hover { 
          background: linear-gradient(180deg, #27272a 0%, #18181b 100%);
          border-color: #3f3f46;
        }
        .ozon-truck-btn.success:not(:disabled):hover { background: linear-gradient(180deg, #34d399 0%, #10b981 100%); }
        .ozon-truck-btn.error:not(:disabled):hover { background: linear-gradient(180deg, #f87171 0%, #ef4444 100%); }

        .ozon-truck-stage {
          position: relative;
          width: 18px;
          height: 18px;
          flex: none;
          overflow: hidden;
        }

        .ozon-truck {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          fill: currentColor;
          opacity: 0;
          transform: translateX(-160%);
        }
        .ozon-truck-btn.sending .ozon-truck {
          opacity: 1;
          animation: truck-drive 1.2s ease-in-out infinite;
        }
        .truck-wheel { transform-origin: center; }
        .ozon-truck-btn.sending .truck-wheel {
          animation: wheel-spin .25s linear infinite;
        }
        
        @keyframes truck-drive {
          0%   { transform: translateX(-160%); }
          45%  { transform: translateX(0%); }
          55%  { transform: translateX(0%); }
          100% { transform: translateX(160%); }
        }
        @keyframes wheel-spin { to { transform: rotate(360deg); } }

        .ozon-speed-lines { position: absolute; inset: 0; opacity: 0; }
        .ozon-truck-btn.sending .ozon-speed-lines { opacity: 1; }
        .ozon-speed-lines span {
          position: absolute;
          left: -8px;
          width: 6px;
          height: 1.5px;
          border-radius: 2px;
          background: rgba(255, 255, 255, 0.7);
          animation: speed-line .5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        .ozon-speed-lines span:nth-child(1) { top: 30%; animation-delay: 0s; }
        .ozon-speed-lines span:nth-child(2) { top: 55%; animation-delay: .15s; }
        .ozon-speed-lines span:nth-child(3) { top: 78%; animation-delay: .3s; }
        @keyframes speed-line {
          0%   { transform: translateX(0) scaleX(0.5); opacity: 0; }
          20%  { opacity: 1; transform: translateX(5px) scaleX(1); }
          100% { transform: translateX(25px) scaleX(0.5); opacity: 0; }
        }

        .ozon-check {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          color: #fff;
          opacity: 0;
        }
        .ozon-truck-btn.success .ozon-check { opacity: 1; }
        .ozon-check-path { stroke-dasharray: 30; stroke-dashoffset: 30; }
        .ozon-truck-btn.success .ozon-check-path {
          animation: check-draw .4s cubic-bezier(0.4, 0, 0.2, 1) forwards .1s;
        }
        @keyframes check-draw { to { stroke-dashoffset: 0; } }

        .ozon-truck-label { transition: opacity .15s ease; }
      `}</style>
    </button>
  );
}

export default OzonSendButton;
