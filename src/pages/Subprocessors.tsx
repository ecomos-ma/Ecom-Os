import { LegalPage } from "../components/LegalPage";

export default function Subprocessors() {
  return <LegalPage eyebrow="Privacy & compliance" title="Subprocessors" description="Ecom OS uses infrastructure and provider services to operate the platform. Seller-enabled integrations may transmit the data required to provide the requested connection.">
    <h2>Infrastructure</h2><ul><li><strong>Supabase:</strong> authentication, PostgreSQL database, storage, and server-side functions used by Ecom OS.</li></ul>
    <h2>Seller-enabled providers</h2><p>Depending on the features you connect, data may be exchanged with Meta, TikTok, Google, Shopify, YouCan, WhatsApp, PayPal, and shipping providers present in your workspace configuration. Ecom OS does not send data to every provider for every account.</p>
    <h2>Changes</h2><p>This list is maintained as the production architecture changes. Contact <a href="mailto:legal@ecomos.ma">legal@ecomos.ma</a> with questions about a specific integration.</p>
  </LegalPage>;
}