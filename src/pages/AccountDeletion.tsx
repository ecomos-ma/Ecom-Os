import { LegalPage } from "../components/LegalPage";

export default function AccountDeletion() {
  return <LegalPage eyebrow="Account controls" title="Account Deletion" description="Account deletion is different from disconnecting one integration or requesting deletion of selected personal data.">
    <h2>Before you delete</h2><p>Account deletion can affect workspaces, team access, orders, customers, products, messages, connected apps, and scheduled synchronization. Workspace owners should review team ownership and export any data they are entitled to retain.</p>
    <h2>Authenticated request</h2><ol><li>Sign in to Ecom OS.</li><li>Open Settings, then Privacy or Account.</li><li>Choose Delete Account, review the affected account and workspace, and type the required confirmation.</li><li>Submit the request. An administrator reviews it before any destructive processing.</li></ol>
    <h2>Cannot sign in?</h2><p>Use the public <a href="/data-deletion">Data Deletion request form</a> and select “Delete account and associated workspace data”. We may need to verify ownership before processing.</p>
    <h2>Retention</h2><p>Deletion processing is scoped and documented. Credentials and integration access are revoked where supported. Records required for security, accounting, dispute handling, or legal obligations may be retained or anonymized for the applicable period.</p>
  </LegalPage>;
}