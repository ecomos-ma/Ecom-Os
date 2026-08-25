# Google Apps Script Fast Sync Guide

**Purpose:** This guide explains how to update your Google Apps Script Web App to support fast delta sync for Ecom OS.

**Background:** The Ecom OS fast sync system needs to efficiently detect and fetch only new rows from your Google Sheet instead of downloading the entire sheet every time.

---

## Quick Start (Ready-to-Use Code)

**Good news:** A complete, ready-to-use Apps Script is already provided in this project!

**File:** `GOOGLE_APPS_SCRIPT_CODE.gs`

**To use it:**
1. Open your Google Sheet
2. Go to Extensions → Apps Script
3. Delete all existing code in `Code.gs`
4. Copy the entire contents of `GOOGLE_APPS_SCRIPT_CODE.gs`
5. Paste it into `Code.gs`
6. Save the project
7. Deploy as Web App (instructions below)
8. Copy the new Web App URL
9. Update it in Ecom OS settings

**That's it!** The script already includes all three modes and error handling.

---

## What the Script Does

Your Apps Script now supports three query modes:

### 1. Meta Mode (`?mode=meta`)
Returns only lightweight metadata about the sheet.

**Response:**
```json
{
  "lastRow": 185,
  "sheetName": "Orders",
  "lastModified": "2026-08-19T10:30:00Z"
}
```

### 2. Delta Mode (`?afterRow=180`)
Returns only rows after a specific row number.

**Response:**
```json
[
  {
    "Order date": "2026-08-19",
    "First name": "John",
    "Phone": "0612345678",
    ...
  },
  {
    "Order date": "2026-08-19",
    "First name": "Jane",
    "Phone": "0612345679",
    ...
  }
]
```

---

## Implementation Example

Here's how to extend your existing `doGet()` function:

```javascript
function doGet(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const params = e.parameter;
  
  // Mode 1: Meta mode - return lightweight metadata
  if (params.mode === 'meta') {
    const lastRow = sheet.getLastRow();
    const sheetName = sheet.getName();
    const lastModified = new Date(sheet.getLastRow()).toISOString();
    
    return ContentService.createTextOutput(JSON.stringify({
      lastRow: lastRow,
      sheetName: sheetName,
      lastModified: lastModified
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  // Mode 2: Delta mode - return only rows after a specific row
  if (params.afterRow) {
    const afterRow = parseInt(params.afterRow, 10);
    const lastRow = sheet.getLastRow();
    
    // Only fetch if there are new rows
    if (afterRow >= lastRow) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Get data range (afterRow + 1 to lastRow)
    // Assuming row 1 is headers, data starts at row 2
    const startRow = Math.max(2, afterRow + 1);
    const numRows = lastRow - startRow + 1;
    
    if (numRows <= 0) {
      return ContentService.createTextOutput(JSON.stringify([]))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    const dataRange = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn());
    const values = dataRange.getValues();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Convert to array of objects
    const rows = values.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
    
    return ContentService.createTextOutput(JSON.stringify(rows))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Mode 3: Default/full mode - return all rows (existing behavior)
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
  const values = dataRange.getValues();
  
  const rows = values.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
  
  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}
```

---

## Important Notes

### Row Numbering
- Google Sheets uses **1-based indexing** (row 1, 2, 3, etc.)
- Ecom OS assumes **row 1 is headers**
- Data starts at **row 2**
- `lastRow` from `sheet.getLastRow()` includes all rows (headers + data)

### Empty Sheets
- If the sheet only has headers (lastRow = 1), delta mode should return `[]`
- Ecom OS handles empty responses gracefully

### Backward Compatibility
- Your existing `doGet()` without parameters should continue to return all rows
- This ensures manual "Sync Now" still works with the old code path
- Only the new modes are used by the fast sync system

### Performance
- The meta mode is extremely fast (just calls `getLastRow()`)
- The delta mode only fetches the new rows, reducing bandwidth and processing time
- This allows the 1-minute cron job to run efficiently even with large sheets

---

## Testing Your Implementation

### Test Meta Mode
Visit your Web App URL with `?mode=meta`:
```
https://script.google.com/macros/s/.../exec?mode=meta
```

Expected response:
```json
{
  "lastRow": 185,
  "sheetName": "Orders",
  "lastModified": "2026-08-19T10:30:00Z"
}
```

### Test Delta Mode
Visit your Web App URL with `?afterRow=180`:
```
https://script.google.com/macros/s/.../exec?afterRow=180
```

Expected response: Array of rows 181-185 (if they exist).

### Test Default Mode
Visit your Web App URL without parameters:
```
https://script.google.com/macros/s/.../exec
```

Expected response: All rows (existing behavior).

---

## Deployment

After updating your code:

1. **Save** your Apps Script project
2. **Deploy** as a new version:
   - Click "Deploy" → "New deployment"
   - Select "Web app"
   - Set "Execute as" to "Me"
   - Set "Who has access" to "Anyone"
   - Copy the new Web App URL
3. **Update** the Web App URL in Ecom OS settings

---

## Troubleshooting

### "Row numbers don't match"
- Ensure you're using 1-based indexing
- Check that row 1 is headers
- Verify `lastRow` includes all rows

### "Delta mode returns empty when it shouldn't"
- Check that `afterRow` is parsed correctly
- Ensure `startRow` calculation is correct
- Verify `numRows` is positive

### "Headers are missing in delta mode"
- Make sure headers are fetched from row 1
- Check that `sheet.getLastColumn()` is correct
- Verify the data range includes all columns

---

## Need Help?

If you encounter issues, please check:
1. The exact error message from Ecom OS sync logs
2. Your Apps Script execution logs (Apps Script Dashboard → Executions)
3. The Web App URL is accessible (test in browser)
4. The deployment has "Anyone" access

---

**Next Steps:** After updating your Apps Script, the Ecom OS fast sync system will automatically use the new modes to detect and import new orders within 1-2 minutes of them appearing in your Google Sheet.