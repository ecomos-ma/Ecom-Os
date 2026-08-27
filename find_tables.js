const fs = require('fs');
const path = require('path');
const migrationsDir = 'c:/Users/pc/Downloads/LANDrop/ecomos1/supabase/migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

let tables = new Set();
for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('workspace_id')) {
            let j = i;
            while (j >= 0) {
                if (lines[j].toLowerCase().includes('create table')) {
                    const m = lines[j].match(/create table\s+(?:if not exists\s+)?([a-zA-Z0-9_.]+)/i);
                    if (m) { tables.add(m[1].trim()); break; }
                } else if (lines[j].toLowerCase().includes('alter table')) {
                    const m = lines[j].match(/alter table\s+(?:if exists\s+)?([a-zA-Z0-9_.]+)/i);
                    if (m) { tables.add(m[1].trim()); break; }
                }
                j--;
            }
        }
    }
}
fs.writeFileSync('workspace_tables_final.txt', Array.from(tables).join('\n'));
