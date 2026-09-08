
function extractForceLogCities(input) {
  const queue = [input];
  const visited = new Set();
  while (queue.length) {
    let candidate = queue.shift();
    if (typeof candidate === 'string') {
      try { candidate = JSON.parse(candidate); } catch { continue; }
    }
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) continue;
    visited.add(candidate);
    if (Array.isArray(candidate)) {
      queue.push(...candidate);
      continue;
    }
    const entries = Object.entries(candidate);
    if (entries.some(([, city]) => city && typeof city === 'object' && (city.CODE || city.code || city.NAME || city.name || city.CITY_NAME || city.city_name))) {
      return entries;
    }
    queue.push(...entries.map(([, value]) => value));
  }
  return [];
}
const response = {
  'AUTH': { 'RESULT': 'SUCCESS', 'MESSAGE': 'Customer Authenticated' },
  'Cities': {
    '1': { 'CODE': 'MRK', 'NAME': 'Marrakech', 'D_FEES': '35', 'D_FEES_SAME_CITY': '25' },
    '2': { 'CODE': 'MKS', 'NAME': 'Meknes', 'D_FEES': '35', 'D_FEES_SAME_CITY': '35' }
  }
};
console.log(extractForceLogCities(response).length);

