const fs = require('fs');
const path = require('path');

const migrationsDir = 'c:\\Users\\pc\\Downloads\\LANDrop\\ecomos1\\supabase\\migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
files.sort(); // Sequential execution to simulate real schema

let tables = new Set();
// some relations like views or types might throw us off, so we'll just track everything created/dropped via table syntax

for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    // Remove single line comments
    const cleanContent = content.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const statements = cleanContent.split(';');

    for (const rawStat of statements) {
        const stat = rawStat.trim().toLowerCase();

        // Create Table
        let m = stat.match(/create\s+(?:unlogged\s+)?table\s+(?:if not exists\s+)?([a-zA-Z0-9_.]+)/i);
        if (m) {
            tables.add(m[1].trim());
        }

        // Drop Table
        m = stat.match(/drop\s+table\s+(?:if exists\s+)?([a-zA-Z0-9_.]+)/i);
        if (m) {
            const dropTargets = m[1].split(',').map(s => s.trim());
            for (const target of dropTargets) {
                tables.delete(target);
                tables.delete('public.' + target.replace('public.', '')); // Handles prefix cases
            }
        }

        // Rename Table
        m = stat.match(/alter\s+table\s+(?:if exists\s+)?([a-zA-Z0-9_.]+)\s+rename\s+to\s+([a-zA-Z0-9_.]+)/i);
        if (m) {
            tables.delete(m[1].trim());
            tables.delete('public.' + m[1].trim().replace('public.', ''));
            tables.add(m[2].trim());
        }
    }
}

// Convert all to unique identifiers (stripping 'public.')
const finalTables = Array.from(tables).map(t => t.replace('public.', '')).filter(Boolean);
const uniqueTables = Array.from(new Set(finalTables)).sort();

fs.writeFileSync('c:\\Users\\pc\\Downloads\\LANDrop\\ecomos1\\simulated_tables.txt', uniqueTables.join('\n'));
