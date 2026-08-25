export function normalizeMoroccanPhone(input) {
  if (input === null || input === undefined) return null;
  let digits = String(input).replace(/[^0-9]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[67][0-9]{8}$/.test(digits)) digits = `212${digits.slice(1)}`;
  else if (/^[67][0-9]{8}$/.test(digits)) digits = `212${digits}`;
  return /^212[67][0-9]{8}$/.test(digits) ? digits : null;
}

export function phoneFromRemoteJid(remoteJid) {
  return normalizeMoroccanPhone(String(remoteJid || "").split("@")[0]);
}

export function toRemoteJid(phone) {
  const normalized = normalizeMoroccanPhone(phone);
  return normalized ? `${normalized}@c.us` : null;
}

