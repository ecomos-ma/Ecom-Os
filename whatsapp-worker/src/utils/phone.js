const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeMoroccanPhone(input) {
  if (input === null || input === undefined) return null;
  let digits = String(input).replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[67][0-9]{8}$/.test(digits)) digits = `212${digits.slice(1)}`;
  else if (/^[67][0-9]{8}$/.test(digits)) digits = `212${digits}`;
  return /^212[67][0-9]{8}$/.test(digits) ? digits : null;
}

export function phoneFromJid(jid) {
  const user = String(jid || "").split("@")[0].split(":")[0];
  return normalizeMoroccanPhone(user);
}

export function toProviderJid(phone) {
  const normalized = normalizeMoroccanPhone(phone);
  return normalized ? `${normalized}@s.whatsapp.net` : null;
}

export function requireWorkspaceId(input) {
  const id = String(input ?? "").trim();
  if (!UUID_PATTERN.test(id)) throw new Error("workspace_id must be a valid UUID");
  return id.toLowerCase();
}
