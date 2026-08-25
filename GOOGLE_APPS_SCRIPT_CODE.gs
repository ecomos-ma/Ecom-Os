/**
 * Google Apps Script for Ecom OS Fast Sync
 * 
 * This script provides three modes for fetching Google Sheets data:
 * 1. Meta mode (?mode=meta) - Returns lightweight metadata (lastRow, sheetName)
 * 2. Delta mode (?afterRow=X) - Returns only rows after row X
 * 3. Default mode (no params) - Returns all rows (backward compatible)
 * 
 * Deployment:
 * 1. Open your Google Sheet
 * 2. Go to Extensions → Apps Script
 * 3. Replace Code.gs with this code
 * 4. Deploy as Web App (doGet)
 * 5. Set access to "Anyone"
 * 6. Copy the Web App URL
 * 7. Paste it in Ecom OS settings
 */

/**
 * Main handler for HTTP GET requests
 * @param {Object} e - Event object with query parameters
 * @returns {ContentService.TextOutput} JSON response
 */
function doGet(e) {
  // Handle case where function is called without event object (e.g., from editor)
  if (!e || !e.parameter) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'This function must be called as a Web App with URL parameters.',
      usage: {
        meta_mode: 'Add ?mode=meta to get sheet metadata',
        delta_mode: 'Add ?afterRow=180 to get rows after row 180',
        default_mode: 'No parameters returns all rows'
      }
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
  
  const params = e.parameter;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Mode 1: Meta mode - return lightweight metadata
  if (params.mode === 'meta') {
    return handleMetaMode(sheet);
  }
  
  // Mode 2: Delta mode - return only rows after a specific row
  if (params.afterRow) {
    return handleDeltaMode(sheet, params.afterRow);
  }
  
  // Mode 3: Default mode - return all rows (existing behavior)
  return handleDefaultMode(sheet);
}

/**
 * Handle meta mode - return lightweight sheet metadata
 * @param {Sheet} sheet - The active sheet
 * @returns {ContentService.TextOutput} JSON with metadata
 */
function handleMetaMode(sheet) {
  const lastRow = sheet.getLastRow();
  const sheetName = sheet.getName();
  
  // Get the last modified time from the sheet's metadata
  const lastModified = new Date().toISOString();
  
  const response = {
    lastRow: lastRow,
    sheetName: sheetName,
    lastModified: lastModified
  };
  
  console.log('Meta mode response:', response);
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle delta mode - return only rows after a specific row number
 * @param {Sheet} sheet - The active sheet
 * @param {string} afterRowStr - The row number to start from (1-based)
 * @returns {ContentService.TextOutput} JSON with delta rows
 */
function handleDeltaMode(sheet, afterRowStr) {
  const afterRow = parseInt(afterRowStr, 10);
  const lastRow = sheet.getLastRow();
  
  console.log(`Delta mode: afterRow=${afterRow}, lastRow=${lastRow}`);
  
  // Validate afterRow parameter
  if (isNaN(afterRow) || afterRow < 0) {
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Invalid afterRow parameter. Must be a positive integer.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
  
  // If no new rows, return empty array
  if (afterRow >= lastRow) {
    console.log('No new rows detected');
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  // Calculate the range to fetch
  // Row 1 is headers, data starts at row 2
  const startRow = Math.max(2, afterRow + 1);
  const numRows = lastRow - startRow + 1;
  
  if (numRows <= 0) {
    console.log('No data rows to fetch');
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  console.log(`Fetching rows ${startRow} to ${lastRow} (${numRows} rows)`);
  
  try {
    // Get headers from row 1
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Get data rows
    const dataRange = sheet.getRange(startRow, 1, numRows, sheet.getLastColumn());
    const values = dataRange.getValues();
    
    // Convert to array of objects
    const rows = values.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
    
    console.log(`Delta mode returning ${rows.length} rows`);
    
    return ContentService.createTextOutput(JSON.stringify(rows))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error in delta mode:', error);
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle default mode - return all rows (existing behavior)
 * @param {Sheet} sheet - The active sheet
 * @returns {ContentService.TextOutput} JSON with all rows
 */
function handleDefaultMode(sheet) {
  const lastRow = sheet.getLastRow();
  
  console.log(`Default mode: fetching all rows, lastRow=${lastRow}`);
  
  // If sheet only has headers, return empty array
  if (lastRow <= 1) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  try {
    // Get headers from row 1
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Get all data rows (from row 2 to lastRow)
    const dataRange = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const values = dataRange.getValues();
    
    // Convert to array of objects
    const rows = values.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        obj[header] = row[index];
      });
      return obj;
    });
    
    console.log(`Default mode returning ${rows.length} rows`);
    
    return ContentService.createTextOutput(JSON.stringify(rows))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (error) {
    console.error('Error in default mode:', error);
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString()
    }))
    .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Optional: Test function to verify the script works
 * Run this from the Apps Script editor to test each mode
 * Note: This tests the helper functions directly, not doGet
 */
function testModes() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  
  // Test meta mode
  console.log('=== Testing Meta Mode ===');
  const metaResult = handleMetaMode(sheet);
  console.log('Meta result:', metaResult.getContent());
  
  // Test delta mode (fetch rows after row 5)
  console.log('\n=== Testing Delta Mode (afterRow=5) ===');
  const deltaResult = handleDeltaMode(sheet, '5');
  console.log('Delta result:', deltaResult.getContent());
  
  // Test default mode
  console.log('\n=== Testing Default Mode ===');
  const defaultResult = handleDefaultMode(sheet);
  console.log('Default result length:', defaultResult.getContent().length);
  
  console.log('\n=== Test Complete ===');
  console.log('To test the actual Web App, deploy it and visit the URL with parameters:');
  console.log('?mode=meta for metadata');
  console.log('?afterRow=5 for delta rows');
  console.log('No parameters for all rows');
}

/**
 * Optional: Helper function to get current sheet info
 * Run this to verify your sheet structure
 */
function getSheetInfo() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const sheetName = sheet.getName();
  
  console.log('Sheet Info:');
  console.log('Name:', sheetName);
  console.log('Last Row:', lastRow);
  console.log('Last Column:', lastCol);
  
  if (lastRow > 0) {
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    console.log('Headers:', headers);
  }
}