import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./hooks/useTheme";
import { providerManager } from "./lib/shipping/ProviderManager";
import "./index.css";
import "./registerServiceWorker";

initTheme();

// Shipping adapters registration; Ozon adapter removed.

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
