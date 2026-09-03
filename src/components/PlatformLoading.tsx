import ecomosLogo from "../assets/ecomos_logo_137x32.png";
import { BarChart3, MessageCircleCheck, PackageCheck, ShieldCheck, Truck } from "lucide-react";

const workspaceModules = [
  { label: "Orders", icon: PackageCheck },
  { label: "Confirm", icon: MessageCircleCheck },
  { label: "Delivery", icon: Truck },
  { label: "Insights", icon: BarChart3 },
];

export function PlatformLoading() {
  return (
    <div
      className="platform-loader"
      role="status"
      aria-live="polite"
      aria-label="Preparing your Ecom OS workspace"
    >
      <div className="platform-loader__glow platform-loader__glow--one" aria-hidden="true" />
      <div className="platform-loader__glow platform-loader__glow--two" aria-hidden="true" />
      <section className="platform-loader__panel">
        <header className="platform-loader__brand">
          <img src={ecomosLogo} alt="Ecom OS" width={137} height={32} draggable={false} />
          <span className="platform-loader__badge"><i /> Seller workspace</span>
        </header>
        <div className="platform-loader__hero">
          <div className="platform-loader__mark" aria-hidden="true">
            <span className="platform-loader__ring" />
            <span className="platform-loader__orbit-dot" />
            <PackageCheck size={27} strokeWidth={2.15} />
          </div>
          <div className="platform-loader__copy">
            <span>Ecom OS command center</span>
            <h1>Getting your operations ready</h1>
            <p>Syncing orders, confirmation, delivery and live insights.</p>
          </div>
        </div>
        <div className="platform-loader__progress" aria-hidden="true"><span /></div>
        <div className="platform-loader__modules" aria-hidden="true">
          {workspaceModules.map(({ label, icon: Icon }) => (
            <div key={label} className="platform-loader__module">
              <Icon size={15} strokeWidth={2} />
              <span>{label}</span>
            </div>
          ))}
        </div>
        <footer className="platform-loader__secure">
          <ShieldCheck size={13} strokeWidth={2.2} />
          Secure workspace startup
        </footer>
        <span className="sr-only">Please wait while your workspace loads.</span>
      </section>
    </div>
  );
}
