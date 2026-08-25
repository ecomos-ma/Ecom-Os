function sanitizeOrderCityAddress(city, address) {
  let c = (city ?? "").trim();
  let a = (address ?? "").trim();

  // Normalize aliases for both c and a
  const normalizeCityName = (val) => {
    const vLower = val.toLowerCase();
    if (vLower === "kech" || vLower === "kecchmara" || vLower === "marrakesh" || vLower === "mrkch") {
      return "Marrakech";
    }
    if (vLower === "casa" || vLower === "dar el beida" || vLower === "dar lbeida" || vLower === "dar el bayda") {
      return "Casablanca";
    }
    if (vLower === "rbat") {
      return "Rabat";
    }
    return val;
  };

  c = normalizeCityName(c);
  a = normalizeCityName(a);

  // Swap logic if city is just digits and address is not
  if (/^\d+$/.test(c) && a && !/^\d+$/.test(a)) {
    const temp = c;
    c = a;
    a = temp;
  }

  return { city: c, address: a };
}

console.log('--- TEST SINGLE PASS NORMALIZATION ---');
console.log('DB: city="433", address="kech" ->', sanitizeOrderCityAddress('433', 'kech'));
console.log('DB: city="kech", address="433" ->', sanitizeOrderCityAddress('kech', '433'));
console.log('DB: city="Marrakech", address="433" ->', sanitizeOrderCityAddress('Marrakech', '433'));
console.log('DB: city="433", address="Marrakech" ->', sanitizeOrderCityAddress('433', 'Marrakech'));
