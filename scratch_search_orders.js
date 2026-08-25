import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) results = results.concat(walk(p));
    else if (p.endsWith('.ts') || p.endsWith('.tsx') || p.endsWith('.js')) results.push(p);
  });
  return results;
}

console.log('=== ORDERS TABLE QUERIES ===');
walk('src').forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  content.split('\n').forEach((line, i) => {
    if (line.includes(".from('orders')") || line.includes('.from("orders")')) {
      console.log(`${f}:${i+1}: ${line.trim()}`);
    }
  });
});

console.log('\n=== CITY / ADDRESS REFERENCES ===');
walk('src').forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  content.split('\n').forEach((line, i) => {
    if (line.includes("city") && line.includes("address")) {
      if (f.includes('Orders') || f.includes('Delivering') || f.includes('Confirmation') || f.includes('sync') || f.includes('export') || f.includes('Import')) {
        console.log(`${f}:${i+1}: ${line.trim()}`);
      }
    }
  });
});
