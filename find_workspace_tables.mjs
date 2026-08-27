import fs from 'fs';
import path from 'path';

const migrationsDir = 'c:\\Users\\pc\\Downloads\\LANDrop\\ecomos1\\supabase\\migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
files.sort();

let tables = new Set();
let currentTable = null;

for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Simple CREATE TABLE matching
        const createMatch = line.match(/create table\s+(?:if not exists\s+)?([a-zA-Z0-9_.]+)/i);
        if (createMatch) {
            currentTable = createMatch[1];
        }

        // Check if the current table has a workspace_id column directly
        if (currentTable && line.match(/\bworkspace_id\b/)) {
            tables.add(currentTable);
        }

        // If block ends, reset currentTable (weak heuristic but enough for an overview)
        if (line.includes(');') && currentTable) {
            // Look back a few lines just in case
            const recentBlock = lines.slice(Math.max(0, i - 100), i + 1).join('\n');
            if (recentBlock.includes('workspace_id')) {
                tables.add(currentTable);
            }
            currentTable = null;
        }

        // Alter table add column
        const alterMatch = line.match(/alter table\s+([a-zA-Z0-9_.]+)\s+add(?: column)?\s+workspace_id/i);
        if (alterMatch) {
            tables.add(alterMatch[1]);
        }
    }
}

console.log(Array.from(tables).join(', '));

