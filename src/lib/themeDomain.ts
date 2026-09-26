function isAsciiLetterOrDigit(value: string) {
  return value >= "a" && value <= "z" || value >= "0" && value <= "9";
}

function validLabel(value: string) {
  if (!value || value.length > 63 || !isAsciiLetterOrDigit(value[0]) || !isAsciiLetterOrDigit(value[value.length - 1])) return false;
  return Array.from(value).every((character) => isAsciiLetterOrDigit(character) || character === "-");
}

export function normalizeThemeDomain(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.length > 512) throw new Error("Invalid domain");
  const value = input.trim();
  if (Array.from(value).some((character) => character.trim() === "" || "@?#*".includes(character))) throw new Error("Invalid domain");
  const schemeIndex = value.indexOf("://");
  if (schemeIndex >= 0 && !["http", "https"].includes(value.slice(0, schemeIndex).toLowerCase())) throw new Error("Invalid domain");
  let url: URL;
  try { url = new URL(schemeIndex >= 0 ? value : "https://" + value); } catch { throw new Error("Invalid domain"); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)) throw new Error("Invalid domain");
  const domain = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  const labels = domain.split(".");
  const tld = labels[labels.length - 1] || "";
  if (domain.length > 253 || labels.length < 2 || labels.some((label) => !validLabel(label)) || tld.length < 2 || (!tld.startsWith("xn--") && !tld.split("").every((character: string) => character >= "a" && character <= "z"))) throw new Error("Invalid domain");
  if (domain.split("").every((character: string) => character >= "0" && character <= "9" || character === ".")) throw new Error("Invalid domain");
  return domain;
}
