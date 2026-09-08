import { LegalPage } from "../components/LegalPage";

export default function Security() {
  return <LegalPage eyebrow="Trust & operations" title="Security" description="Ecom OS uses layered controls to protect accounts, workspaces, integration credentials, and operational data. No service can guarantee absolute security.">
    <h2>Controls in the application</h2><ul><li>HTTPS is used for production transport.</li><li>Supabase Authentication manages account sessions and token refresh.</li><li>Row Level Security policies are used across exposed Supabase tables for workspace and user isolation.</li><li>Platform administration uses role and permission checks.</li><li>Provider credentials and OAuth exchanges are handled through server-side functions where supported; tokens are not displayed in the user interface.</li><li>Operational and administrative activity is logged where implemented.</li></ul>
    <h2>Your responsibilities</h2><p>Use a unique password, protect team access, review connected apps, and report suspected unauthorized activity promptly. Disconnect credentials you no longer need.</p>
    <h2>Report an issue</h2><p>Send security concerns to <a href="mailto:support@ecomos.ma">support@ecomos.ma</a> or <a href="mailto:legal@ecomos.ma">legal@ecomos.ma</a>. Ecom OS does not claim SOC 2, ISO 27001, PCI, penetration-testing, or regulatory certification on this page.</p>
  </LegalPage>;
}