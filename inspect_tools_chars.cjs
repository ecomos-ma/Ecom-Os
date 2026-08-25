const fs=require('fs');
const s=fs.readFileSync('src/pages/Tools.tsx','utf8');
const idx=s.indexOf('Réponds');
console.log('idx',idx);
console.log(s.substr(idx,80));
for(let i=idx;i<idx+80;i++){
  const ch=s.charCodeAt(i);
  const display=(ch<128?String.fromCharCode(ch):'\\u'+ch.toString(16));
  process.stdout.write(display);
}
console.log('\n--- codes ---');
for(let i=idx;i<idx+80;i++){
  process.stdout.write(s.charCodeAt(i).toString()+',');
}
console.log();
