const fs = require('fs');
const path = require('path');
const migrationsDir = 'c:\\Users\\pc\\Downloads\\LANDrop\\ecomos1\\supabase\\migrations';
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));
files.sort();

const workspaceColumns = new Set();
let inWorkspaceTable = false;

for (const file of files) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8').replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const statements = content.split(';');

    for (const rawStat of statements) {
        const stat = rawStat.trim().replace(/\n/g, ' ');
        if (!stat) continue;

        // Check for CREATE TABLE workspaces
        if (stat.match(/create\s+table\s+(?:if not exists\s+)?(public\.)?workspaces\b/i)) {
            // Extract columns inside parenthesis
            const match = stat.match(/\((.*)\)/i);
            if (match) {
                const cols = match[1].split(',');
                for (const col of cols) {
                    const colName = col.trim().split(' ')[0];
                    if (colName && !colName.toLowerCase().includes('primary') && !colName.toLowerCase().includes('foreign') && !colName.toLowerCase().includes('unique') && !colName.toLowerCase().includes('check')) {
                        workspaceColumns.add(colName.toLowerCase());
                    }
                }
            }
        }

        // Check for ALTER TABLE workspaces ADD
        const alterMatch = stat.match(/alter\s+table\s+(?:if exists\s+)?(?:public\.)?workspaces\s+(.*)/i);
        if (alterMatch) {
            const actions = alterMatch[1].split(',');
            for (const action of actions) {
                if (action.trim().toLowerCase().startsWith('add column')) {
                    const colName = action.trim().split(' ')[2];
                    workspaceColumns.add(colName.toLowerCase());
                } else if (action.trim().toLowerCase().startsWith('add ')) {
                    const colName = action.trim().split(' ')[1];
                    if (colName && !['constraint', 'primary', 'foreign', 'unique', 'check'].includes(colName.toLowerCase())) {
                        workspaceColumns.add(colName.toLowerCase());
                    }
                }
            }
        }

        // Check for drop column
        if (alterMatch) {
            const actions = alterMatch[1].split(',');
            for (const action of actions) {
                if (action.trim().toLowerCase().startsWith('drop column')) {
                    const colName = action.trim().split(' ')[2];
                    workspaceColumns.delete(colName.toLowerCase());
                }
            }
        }
    }
}

fs.writeFileSync('c:\\Users\\pc\\Downloads\\LANDrop\\ecomos1\\workspace_columns.txt', Array.from(workspaceColumns).sort().join('\n'));
