const fs=require('fs');
const p='src/pages/Tools.tsx';
let s=fs.readFileSync(p,'utf8');
const oldStr='\\`\\`\\`';
if(s.indexOf(oldStr)===-1){
  console.error('pattern not found');
  process.exit(2);
}
s=s.split(oldStr).join("${'```'}");
fs.writeFileSync(p,s,'utf8');
console.log('replaced');
