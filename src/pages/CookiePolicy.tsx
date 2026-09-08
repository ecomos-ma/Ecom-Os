import { LegalPage } from "../components/LegalPage";

export default function CookiePolicy() {
  return <LegalPage eyebrow="Privacy & compliance" title="Cookie Policy" description="This policy describes browser storage and cookies used by Ecom OS. It reflects the current application architecture and may change as features are added.">
    <h2>Essential storage</h2><p>Supabase authentication uses browser-managed session storage and cookies as configured by the authentication client. These are required to keep signed-in sessions, refresh access, and protect authenticated actions. Ecom OS also uses browser storage for necessary interface state such as theme or workspace preferences.</p>
    <h2>Preferences</h2><p>Preference storage helps remember choices such as language, theme, and interface settings. Removing it may reset those choices but should not delete server-side account data.</p>
    <h2>Analytics and advertising</h2><p>Ecom OS does not currently claim to use non-essential advertising cookies or an advertising cookie network on these public pages. Where analytics are enabled in the future, this policy will be updated to identify the provider and purpose.</p>
    <h2>Third parties</h2><p>Connected integrations may set or read their own browser data when you use their authorization flows. Their use is governed by their own policies. You can disconnect integrations from Ecom OS Settings and clear browser storage through your browser controls.</p>
  </LegalPage>;
}