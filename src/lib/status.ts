export type NormalizedStatusKey =
  | "confirmed"
  | "cancelled"
  | "refused_returned"
  | "no_answer"
  | "pending"
  | "contacted"
  | "delivered"
  | "other";

function normalizeText(s?: string | null) {
  if (s === null || s === undefined) return "";
  const str = String(s).trim().toLowerCase();
  // remove diacritics (compat-safe)
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeStatus(status?: string | null, deliveryStatus?: string | null): NormalizedStatusKey {
  const s = normalizeText(status);
  const d = normalizeText(deliveryStatus);
  const combined = `${s} ${d}`.trim();

  const confirmed = /\b(confirm|confirme|confirmee|confirmee|confirme)\b/;
  const cancelled = /\b(cancel|canceled|cancelled|injoignable|double|produit indisponible|blacklist|client pas serieux|annule)\b/;
  const refused = /\b(refus|refuse|refusee|refusee|refuse|retour|returned|return|refuse|refusee|refusee)\b/;
  const noAnswer = /\b(no answer|pas de reponse|pas de reponse|pas de reponse|pas de reponse|pas de reponse|noresponse|no response|boite vocal|voicemail|pas de reponse)\b/;
  const pending = /\b(pending|new|saisie|attent|en attente|programme)\b/;
  const contacted = /\b(contact|appel|called|contacted|connect|lead)\b/;
  const delivered = /\b(livre|livree|livree|livre|delivered|paye|payé|payé)\b/;

  if (confirmed.test(combined)) return "confirmed";
  if (cancelled.test(combined)) return "cancelled";
  if (refused.test(combined)) return "refused_returned";
  if (noAnswer.test(combined)) return "no_answer";
  if (pending.test(combined)) return "pending";
  if (contacted.test(combined)) return "contacted";
  if (delivered.test(combined)) return "delivered";

  return "other";
}

export const STATUS_DISPLAY_LABEL: Record<NormalizedStatusKey, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  refused_returned: "Refused / Returned",
  no_answer: "No Answer",
  pending: "Pending / Other",
  contacted: "Contacted",
  delivered: "Delivered",
  other: "Other",
};
