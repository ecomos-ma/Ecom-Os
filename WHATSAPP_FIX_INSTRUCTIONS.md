# 🔧 WhatsApp Address Flow - Fix Instructions

## Problem
When you type "1" or the confirmation number, you get no response. This is because PostgreSQL can't choose between two conflicting function signatures for `process_whatsapp_inbound`.

## Solution Status
✅ Conflicting migrations disabled
✅ Function cleanup prepared  
⏳ **MANUAL STEP NEEDED**: Run SQL in Supabase dashboard

## Step-by-Step Fix

### 1. Open Supabase SQL Editor
- Go to: https://app.supabase.com/project/YOUR_PROJECT_ID/sql/new
- (Replace YOUR_PROJECT_ID with your actual project ID)

### 2. Copy the Fix SQL
Open the file `fix-whatsapp-flow.sql` in this directory and copy ALL its contents.

### 3. Paste into SQL Editor
In the Supabase SQL Editor that opened in step 1, paste the complete SQL.

### 4. Click "Run" 
Wait for the query to complete. You should see:
```
Successfully executed N queries
```

### 5. Verify Success
You should see no error messages. The functions will be created/updated.

## What This Fix Does

The `fix-whatsapp-flow.sql` script:

1. ✅ Drops all old conflicting versions of `process_whatsapp_inbound`
2. ✅ Creates ONE clean version that handles:
   - Customer types "1" → Bot asks for address
   - Customer sends address → Address saved to order
   - Customer confirms "4" → Order marked confirmed + address stored
3. ✅ Sets up helper functions for message queuing
4. ✅ Creates triggers for automation

## After The Fix

Your WhatsApp flow will work:

```
Customer: "1"  
Bot: "Mzyan ✅ kteb lina l'adresse kamla dyalk."
Customer: "Quartier Kasbah, Rue Mohammed V, Marrakech"
Bot: "📍 L'adresse dyalk: Quartier Kasbah, Rue Mohammed V, Marrakech. Ila s7i7a, kteb 4 bach n2akdo talab."
Customer: "4"
Bot: "Tm taكيد talab ✅"
Order: status = 'confirmed' + address saved ✅
```

## Troubleshooting

**Error: "Cannot connect to Supabase"**
- Make sure you're logged into your Supabase account
- Check that you have the correct project selected

**Error: "Syntax error in SQL"**
- Make sure you copied the ENTIRE `fix-whatsapp-flow.sql` file
- Don't manually edit it before running

**Still no response when typing "1"**
- Verify the fix SQL ran successfully (should show no errors)
- Check WhatsApp worker logs for any issues
- Make sure order has status 'delivered' or 'sent' before sending "1"

## Need Help?

Check these locations in your codebase:
- Frontend logic: `src/pages/settings/components/WhatsAppSettingsModal.tsx`
- Worker handler: `whatsapp-worker/src/supabase/repository.js`
- Automation settings: Check database table `whatsapp_address_automation_settings`

## Files Changed This Session

Disabled (to prevent conflicts):
- ✖️ `DISABLED_20260831190000_restore_whatsapp_confirmation_only.sql`
- ✖️ `DISABLED_202608310001_whatsapp_custom_actions.sql`
- ✖️ `DISABLED_202608310002_whatsapp_custom_actions_v2.sql`

Updated:
- ✏️ `20260831200000_reenable_whatsapp_address_confirmation_flow.sql`

Created:
- ✨ `fix-whatsapp-flow.sql` (manual fix for immediate application)

All changes committed to git branch: `fresh-start`
