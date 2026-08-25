import amineToolsHtml from "../../amine-tools-index-final.html?raw";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../hooks/useTheme";
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "../lib/supabase";

const embeddedToolsHtml = amineToolsHtml
  .replace(
    "</head>",
    `<script>
    // The iframe intentionally has an opaque origin so the supplied document
    // cannot read the EcomOS session. Its original client-only tools use
    // localStorage, though, so give them an isolated per-page store instead.
    (() => {
      const values = new Map();
      const isolatedStorage = {
        getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
        setItem: (key, value) => { values.set(String(key), String(value)); },
        removeItem: (key) => { values.delete(String(key)); },
        clear: () => { values.clear(); },
        key: (index) => [...values.keys()][index] || null,
        get length() { return values.size; },
      };
      try {
        window.localStorage.getItem("__ecomos_tools_storage_probe__");
      } catch {
        try {
          Object.defineProperty(window, "localStorage", { configurable: true, value: isolatedStorage });
        } catch {
          // The page still works without persistence; this merely prevents a
          // storage exception from stopping the rest of its tool scripts.
        }
      }
    })();
    </script><style>
    /* EcomOS provides the application navigation and visual language. */
    nav { display: none !important; }

    :root {
      --ecomos-accent: #db6a8f;
      --bg: #f8fafc;
      --surface: #ffffff;
      --surface2: #f8fafc;
      --border: #e2e8f0;
      --border2: #cbd5e1;
      --gold: var(--ecomos-accent);
      --gold2: var(--ecomos-accent);
      --green: var(--ecomos-accent);
      --green2: var(--ecomos-accent);
      --text: #0f172a;
      --muted: #64748b;
      --danger: #ef4444;
    }

    html[data-ecomos-theme="dark"] {
      --bg: #0b1220;
      --surface: #111827;
      --surface2: #1f2937;
      --border: #334155;
      --border2: #475569;
      --text: #f8fafc;
      --muted: #94a3b8;
    }

    html, body { background: var(--bg); height: auto; min-height: 0; }
    body {
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body::before { display: none; }
    .wrap { max-width: none; padding: 0 24px; }
    /* EcomOS already owns the page chrome, so the source landing hero is not
       rendered as a second site header inside the application. */
    .hero { display: none !important; }
    .section-label { margin-top: 22px; color: var(--muted); }

    .tools-grid { gap: 14px; padding: 12px 0 24px; }
    .tool-box { min-height: 172px; border-width: 1px; border-radius: 16px; box-shadow: none; background: var(--surface); padding: 18px; }
    .tool-box::before { background: radial-gradient(circle at top right, color-mix(in srgb, var(--ecomos-accent) 14%, transparent), transparent 58%) !important; }
    .tool-box:hover { border-color: color-mix(in srgb, var(--ecomos-accent) 45%, var(--border)); box-shadow: 0 12px 28px rgba(15, 23, 42, .10); }
    html[data-ecomos-theme="dark"] .tool-box:hover { box-shadow: 0 12px 28px rgba(0, 0, 0, .24); }
    .tool-box.active { border-color: var(--ecomos-accent); background: color-mix(in srgb, var(--ecomos-accent) 7%, var(--surface)); }
    .tool-box-name, .tool-box.tiktok-box .tool-box-name, .tool-box.mp4box .tool-box-name, .tool-box.bgbox .tool-box-name, .tool-box.qrbox .tool-box-name, .tool-box.codbox .tool-box-name, .tool-box.fcbox .tool-box-name, .tool-box.testerbox .tool-box-name, .tool-box.aibox .tool-box-name, .lpbox .tool-box-name { color: var(--text); background: none; -webkit-text-fill-color: currentColor; }
    .tool-box-name { font-size: 16px; letter-spacing: -.3px; }
    .tool-box-icon { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--ecomos-accent) 28%, var(--border)); border-radius: 12px; background: color-mix(in srgb, var(--ecomos-accent) 10%, var(--surface)); color: var(--ecomos-accent); }
    .tool-box-icon svg { width: 20px; height: 20px; stroke: currentColor; stroke-width: 1.9; fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .tool-box-desc { font-size: 12px; color: var(--muted); }
    .tool-tag, .fmt-tag { background: var(--surface2); border-color: var(--border); color: var(--muted); }
    .tool-box-arrow { color: var(--ecomos-accent); }
    .tool-box:hover .tool-box-arrow, .tool-box.active .tool-box-arrow { color: var(--ecomos-accent); }

    /* A selected tool is a focused workspace, not a panel far below the grid. */
    .tool-panel { display: none !important; max-height: none !important; opacity: 1 !important; transition: none !important; }
    .tool-panel.open { display: block !important; padding: 20px 24px 28px; }
    body.ecomos-tool-open .wrap { padding: 0; }
    body.ecomos-tool-open .hero, body.ecomos-tool-open .section-label, body.ecomos-tool-open #tools-grid { display: none !important; }
    .tool-panel-inner { max-width: none; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; overflow: visible; }
    .panel-close-btn { width: auto; height: 34px; padding: 0 12px; font-size: 12px; font-weight: 700; color: var(--text); background: var(--surface2); }
    .panel-close-btn:hover { color: var(--ecomos-accent); border-color: var(--ecomos-accent); }
    .drop-zone, .settings, .al-input-card, .img-card { background: #f8fafc; }
    html[data-ecomos-theme="dark"] .drop-zone, html[data-ecomos-theme="dark"] .settings, html[data-ecomos-theme="dark"] .al-input-card, html[data-ecomos-theme="dark"] .img-card { background: var(--surface2); }
    .drop-zone:hover, .drop-zone.drag-over { background: #fff; border-color: var(--green2); }
    html[data-ecomos-theme="dark"] .drop-zone:hover, html[data-ecomos-theme="dark"] .drop-zone.drag-over { background: var(--surface); }
    .btn.primary, .browse-btn { background: var(--ecomos-accent); border-color: var(--ecomos-accent); }
    .btn.primary:hover, .browse-btn:hover { background: color-mix(in srgb, var(--ecomos-accent) 84%, #000); border-color: currentColor; }

    @media (max-width: 700px) {
      .wrap { padding: 0 14px; }
      .tools-grid { gap: 12px; }
      .tool-box { min-height: 164px; padding: 16px 14px; }
      .tool-panel.open { padding: 12px 14px 20px; }
      .tool-panel-inner { padding: 0; border-radius: 0; }
    }
    </style></head>`,
  )
  .replace(
    "</body>",
    `<script>
      (() => {
        const browserFetch = window.fetch.bind(window);
        const pendingRequests = new Map();
        let requestSequence = 0;
        const managedKey = () => "managed-by-ecomos";

        window.addEventListener("message", (event) => {
          if (event.source !== window.parent || event.data?.type !== "ecomos-tools-response") return;
          const pending = pendingRequests.get(event.data.id);
          if (!pending) return;
          pendingRequests.delete(event.data.id);
          if (!event.data.ok) {
            pending.reject(new Error(event.data.error || "EcomOS Tools request failed"));
            return;
          }
          pending.resolve(event.data);
        });

        const requestFromEcomos = (action, payload, transfer = []) => new Promise((resolve, reject) => {
          const id = "tools_" + (++requestSequence) + "_" + Date.now();
          pendingRequests.set(id, { resolve, reject });
          window.parent.postMessage({ type: "ecomos-tools-request", id, action, payload }, "*", transfer);
          window.setTimeout(() => {
            if (!pendingRequests.has(id)) return;
            pendingRequests.delete(id);
            reject(new Error("EcomOS Tools request timed out"));
          }, 90_000);
        });

        // The exact original UI remains in the iframe; only its three
        // provider fetches are handled by the authenticated EcomOS parent.
        window.fetch = async (input, init = {}) => {
          const requestUrl = input instanceof Request ? input.url : String(input);
          if (requestUrl.includes("generativelanguage.googleapis.com")) {
            const model = requestUrl.match(/models\\/([^:/?]+):generateContent/i)?.[1] || "gemini-2.0-flash";
            const payload = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
            const parts = Array.isArray(payload?.contents) ? payload.contents.flatMap((content) => Array.isArray(content?.parts) ? content.parts : []) : [];
            const action = parts.some((part) => part?.inline_data?.mime_type?.startsWith("image/"))
              ? "landing-page-generate"
              : "gemini-generate";
            const result = await requestFromEcomos(action, { model, payload });
            return new Response(result.body, { status: result.status, headers: result.headers });
          }
          if (requestUrl.includes("api.remove.bg/v1.0/removebg")) {
            const form = init.body;
            const file = form instanceof FormData ? form.get("image_file") : null;
            if (!(file instanceof File)) throw new Error("An image file is required");
            const buffer = await file.arrayBuffer();
            const result = await requestFromEcomos("removebg", {
              name: file.name, type: file.type, size: form.get("size") || "auto", buffer,
            }, [buffer]);
            return new Response(result.buffer, { status: result.status, headers: result.headers });
          }
          if (requestUrl.includes("tikwm.com/api")) {
            const videoUrl = new URL(requestUrl).searchParams.get("url");
            if (!videoUrl) return browserFetch(input, init);
            const result = await requestFromEcomos("tiktok-resolve", { url: videoUrl });
            return new Response(result.body, { status: result.status, headers: result.headers });
          }
          return browserFetch(input, init);
        };

        // The supplied document has both legacy and current Gemini key
        // helpers. Override every one before a tool can ask the user for a key.
        window.aiGetKey = managedKey;
        window.getAiKey = managedKey;
        window.getBgApiKey = managedKey;
        document.querySelectorAll("#ai-api-key, #amine-gemini-key, #amine-removebg-key").forEach((input) => {
          input.value = "";
          input.placeholder = "Managed securely by EcomOS Super Admin";
          input.disabled = true;
        });

        const applyPlatformTheme = (theme) => {
          if (!theme || (theme.mode !== "light" && theme.mode !== "dark")) return;
          document.documentElement.dataset.ecomosTheme = theme.mode;
          if (/^#[0-9a-f]{6}$/i.test(theme.accent || "")) {
            document.documentElement.style.setProperty("--ecomos-accent", theme.accent);
          }
        };

        window.addEventListener("message", (event) => {
          if (event.source !== window.parent || event.data?.type !== "ecomos-tools-theme") return;
          applyPlatformTheme(event.data.theme);
        });

        const toolIcons = {
          aibox: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/>',
          lpbox: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 15 3-3 2 2 3-4 3 5M7.5 8.5h.01"/>',
          "squishit-box": '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m9 8-3 4 3 4M15 8l3 4-3 4"/>',
          "tiktok-box": '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 20h14"/>',
          mp4box: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
          bgbox: '<path d="M9 3v5M15 3v5M3 9h5M3 15h5M16 16l5 5M16 21l5-5"/><path d="M9 9h6v6H9z"/>',
          qrbox: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2M18 14h2v2M14 18h2v2M18 18h2v2"/>',
          codbox: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8M8 11h2M14 11h2M8 15h2M14 15h2M8 18h8"/>',
          fcbox: '<path d="M20 15a4 4 0 0 1-4 4H9l-5 3V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4Z"/><path d="M8 11h8M8 15h5"/>',
          testerbox: '<path d="M9 3h6M10 3v6l-5 8a3 3 0 0 0 3 4h8a3 3 0 0 0 3-4l-5-8V3"/><path d="M8 16h8"/>',
        };
        Object.entries(toolIcons).forEach(([id, paths]) => {
          const icon = document.querySelector("#" + id + " .tool-box-icon");
          if (icon) icon.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + '</svg>';
        });
        document.querySelectorAll(".panel-close-btn").forEach((button) => {
          button.textContent = "← All tools";
          button.setAttribute("aria-label", "Back to all tools");
        });

        const panelClasses = ["active", "tiktok-active", "converter-active", "bg-active", "qr-active", "cod-active", "fc-active", "tester-active", "ai-active", "lp-active"];
        const panelAccentClasses = {
          "amine-panel": "tiktok-active", "mp4-panel": "converter-active", "bg-panel": "bg-active",
          "qr-panel": "qr-active", "cod-panel": "cod-active", "fc-panel": "fc-active",
          "tester-panel": "tester-active", "ai-panel": "ai-active", "lp-panel": "lp-active",
        };
        const focusWorkspace = () => window.parent.postMessage({ type: "amine-tools-focus" }, "*");
        const clearActiveTool = () => {
          document.querySelectorAll(".tool-panel").forEach((item) => item.classList.remove("open"));
          document.querySelectorAll(".tool-box").forEach((item) => item.classList.remove(...panelClasses));
        };

        // Replace the source document's below-the-grid disclosure behaviour
        // with a focused workspace that opens at the top of this EcomOS page.
        window.toggleTool = (panelId, boxId) => {
          const panel = document.getElementById(panelId);
          const box = document.getElementById(boxId);
          if (!panel || !box) return;
          const wasOpen = panel.classList.contains("open");
          clearActiveTool();
          if (wasOpen) {
            document.body.classList.remove("ecomos-tool-open");
            reportHeight();
            return;
          }
          panel.classList.add("open");
          box.classList.add("active");
          if (panelAccentClasses[panelId]) box.classList.add(panelAccentClasses[panelId]);
          document.body.classList.add("ecomos-tool-open");
          if (panelId === "fc-panel" && typeof window.fcRender === "function") window.fcRender();
          if (panelId === "tester-panel" && typeof window.testerRender === "function") window.testerRender();
          if (panelId === "ai-panel") {
            if (typeof window.aiLoadKey === "function") window.aiLoadKey();
            if (typeof window.sawtyRender === "function") window.sawtyRender();
            if (typeof window.aiInitAngles === "function") window.aiInitAngles();
          }
          if (panelId === "lp-panel" && typeof window.lpInitAngles === "function") window.lpInitAngles();
          requestAnimationFrame(() => {
            reportHeight();
            focusWorkspace();
          });
        };

        window.closePanel = (panelId, boxId) => {
          document.getElementById(panelId)?.classList.remove("open");
          document.getElementById(boxId)?.classList.remove(...panelClasses);
          document.body.classList.remove("ecomos-tool-open");
          requestAnimationFrame(() => {
            reportHeight();
            focusWorkspace();
          });
        };

        const reportHeight = () => {
          // Do not use documentElement.scrollHeight: it includes the iframe
          // viewport, which fed height changes back into the parent forever.
          const blocks = [document.querySelector(".wrap"), ...document.querySelectorAll(".tool-panel.open")].filter(Boolean);
          const contentBottom = blocks.reduce((bottom, block) => {
            const rect = block.getBoundingClientRect();
            return Math.max(bottom, rect.bottom + window.scrollY);
          }, 0);
          const height = Math.max(420, Math.ceil(contentBottom) + 24);
          window.parent.postMessage({ type: "amine-tools-height", height }, "*");
        };

        new ResizeObserver(reportHeight).observe(document.body);
        new MutationObserver(() => {
          reportHeight();
          window.setTimeout(reportHeight, 650);
        }).observe(document.body, { attributes: true, childList: true, subtree: true });
        window.addEventListener("load", reportHeight);
        window.addEventListener("resize", reportHeight);
        document.addEventListener("click", () => {
          reportHeight();
          window.setTimeout(reportHeight, 50);
          window.setTimeout(reportHeight, 700);
        });
      })();
    </script></body>`,
  );

/**
 * Keep the supplied tools document pixel-for-pixel intact while rendering it
 * within the authenticated EcomOS layout (sidebar and platform header remain).
 */
export default function AmineTools() {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameHeight, setFrameHeight] = useState(720);
  const { mode, accent } = useTheme();

  const sendPlatformTheme = () => {
    frameRef.current?.contentWindow?.postMessage({
      type: "ecomos-tools-theme",
      theme: { mode, accent },
    }, "*");
  };

  useEffect(() => {
    const respond = (id: string, data: Record<string, unknown>, transfer?: Transferable[]) => {
      frameRef.current?.contentWindow?.postMessage({ type: "ecomos-tools-response", id, ...data }, "*", transfer || []);
    };

    const receiveToolRequest = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow || event.data?.type !== "ecomos-tools-request") return;
      const { id, action, payload } = event.data as { id?: string; action?: string; payload?: Record<string, unknown> };
      if (!id || !payload || !["gemini-generate", "landing-page-generate", "removebg", "tiktok-resolve"].includes(action || "")) return;

      void (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session?.access_token) throw new Error("Your EcomOS session has expired. Please sign in again.");
          const headers = {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
          };
          const endpoint = `${SUPABASE_URL}/functions/v1/tools-api`;

          if (action === "gemini-generate" || action === "landing-page-generate") {
            const model = String(payload.model || "");
            if (!/^[a-zA-Z0-9._-]{1,100}$/.test(model) || !payload.payload) throw new Error("Invalid Gemini request");
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json", "x-tools-action": action },
              body: JSON.stringify({ model, payload: payload.payload }),
            });
            respond(id, {
              ok: response.ok,
              status: response.status,
              body: await response.text(),
              headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
            });
            return;
          }

          if (action === "removebg") {
            const buffer = payload.buffer;
            const type = String(payload.type || "");
            const name = String(payload.name || "image");
            if (!(buffer instanceof ArrayBuffer) || buffer.byteLength > 12 * 1024 * 1024 || !type.startsWith("image/")) {
              throw new Error("Invalid image request");
            }
            const form = new FormData();
            form.append("image_file", new Blob([buffer], { type }), name);
            form.append("size", String(payload.size || "auto"));
            const response = await fetch(endpoint, {
              method: "POST",
              headers: { ...headers, "x-tools-action": action },
              body: form,
            });
            const resultBuffer = await response.arrayBuffer();
            respond(id, {
              ok: response.ok,
              status: response.status,
              buffer: resultBuffer,
              headers: { "Content-Type": response.headers.get("Content-Type") || "image/png" },
            }, [resultBuffer]);
            return;
          }

          const videoUrl = String(payload.url || "");
          if (!/^https:\/\//i.test(videoUrl) || videoUrl.length > 2_000) throw new Error("Invalid TikTok URL");
          const response = await fetch(`${endpoint}?action=tiktok-resolve&url=${encodeURIComponent(videoUrl)}`, { headers });
          respond(id, {
            ok: response.ok,
            status: response.status,
            body: await response.text(),
            headers: { "Content-Type": response.headers.get("Content-Type") || "application/json" },
          });
        } catch (error) {
          respond(id, { ok: false, error: error instanceof Error ? error.message : "Tools request failed" });
        }
      })();
    };

    window.addEventListener("message", receiveToolRequest);
    return () => window.removeEventListener("message", receiveToolRequest);
  }, []);

  useEffect(() => {
    const receiveFrameHeight = (event: MessageEvent) => {
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: string; height?: number };
      if (data?.type === "amine-tools-focus") {
        frameRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      if (data?.type !== "amine-tools-height" || !Number.isFinite(data.height)) return;
      setFrameHeight(Math.max(560, Math.ceil(data.height!) + 2));
    };

    window.addEventListener("message", receiveFrameHeight);
    return () => window.removeEventListener("message", receiveFrameHeight);
  }, []);

  useEffect(() => {
    // Wait one frame so the newly-created srcDoc document can receive updates.
    const frame = window.requestAnimationFrame(sendPlatformTheme);
    return () => window.cancelAnimationFrame(frame);
  }, [mode, accent]);

  return (
    <section className="bg-transparent">
      <iframe
        ref={frameRef}
        title="Amine tools"
        srcDoc={embeddedToolsHtml}
        onLoad={sendPlatformTheme}
        sandbox="allow-scripts allow-forms allow-downloads allow-modals"
        scrolling="no"
        style={{ height: frameHeight }}
        className="block w-full border-0"
      />
    </section>
  );
}
