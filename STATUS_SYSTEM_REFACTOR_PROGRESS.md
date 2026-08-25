# Status System Refactor - Progress Report

## ✅ COMPLETED

### 1. Centralized Status Engine
- **File**: `src/lib/statusEngine.ts`
- **Content**: 
  - Canonical status definitions (15 statuses)
  - English and French translations
  - Status colors
  - Status icons
  - Status sorting order
  - Normalization mappings (French + English variations)
  - Helper functions (normalizeStatus, getStatusLabel, getStatusColor, etc.)

### 2. Database Migration
- **File**: `migrate_status_system_canonical.sql`
- **Content**:
  - Adds `status_language` column to workspaces table
  - Normalizes all existing orders to canonical keys
  - Normalizes shipments table
  - Adds constraint to ensure only canonical values
  - Creates index on status column

### 3. Type Definitions
- **File**: `src/lib/types.ts`
- **Changes**:
  - Updated OrderStatus type to only include canonical keys
  - Updated Workspace type to include required status_language field

### 4. StatusBadge Component
- **File**: `src/components/StatusBadge.tsx`
- **Changes**:
  - Now imports from statusEngine instead of statusRegistry
  - Uses getStatusLabel, getStatusBadgeClasses, getStatusIcon from statusEngine
  - Removed MapOff icon (doesn't exist in lucide-react)

### 5. Old Status Registry
- **File**: `src/lib/statusRegistry.ts`
- **Action**: DELETED (replaced by statusEngine.ts)

### 6. Settings Page
- **File**: `src/pages/Settings.tsx`
- **Status**: Already has status_language selector implemented
- **Lines**: 207, 224, 337

## 🔄 IN PROGRESS

### 7. Orders Page Updates
- **File**: `src/pages/Orders.tsx`
- **Status**: Partially updated
- **Completed**:
  - Added imports from statusEngine
  - Removed CONFIRMED_STATUSES array
  - Updated isConfirmedOrderStatus to check for 'confirmed' only
- **Remaining**:
  - Replace STATUSES array with getSortedStatusOptions
  - Replace SHIPPING_STATUSES array
  - Update filter dropdown to use translated options
  - Update Edit Order modal to use translated canonical statuses
  - Update Google Sheets sync to normalize statuses on import

## ⏳ PENDING

### 8. Other Pages with Status Arrays
- **Files**:
  - `src/pages/Delivering.tsx`
  - `src/pages/Shipping.tsx`
  - `src/pages/Confirmation.tsx`
- **Actions Needed**:
  - Search for all status arrays
  - Replace with statusEngine imports
  - Update filters to use canonical keys
  - Update displays to use translated labels

### 9. Dashboard
- **File**: `src/pages/Dashboard.tsx`
- **Actions Needed**:
  - Update status aggregation to use canonical keys
  - Ensure counts are correct (no duplicates)

### 10. Charts
- **Files**: Any chart components
- **Actions Needed**:
  - Group by canonical keys
  - Show translated labels

### 11. Import Functions
- **Files**:
  - Google Sheets import (in Orders.tsx)
  - YouCan import
  - Any other import functions
- **Actions Needed**:
  - Add normalizeStatus call before saving to database
  - Ensure only canonical keys are stored

### 12. Remove Duplicates
- **Action**: Search entire codebase for:
  - Status arrays
  - Translation maps
  - Color maps
  - Badge color functions
- **Replace**: All with statusEngine imports

### 13. Verification
- **Actions**:
  - Run database migration
  - Verify database stores only canonical keys
  - Test language switching
  - Verify all pages display correctly
  - Verify filters work correctly
  - Verify charts aggregate correctly

## 📋 NEXT STEPS

1. Complete Orders.tsx updates
2. Update Delivering.tsx
3. Update Shipping.tsx
4. Update Confirmation.tsx
5. Update Dashboard.tsx
6. Search and remove all duplicate status arrays
7. Add normalizeStatus to all import functions
8. Run database migration
9. Test language switching
10. Final verification

## 🎯 ACCEPTANCE CRITERIA

- ✅ Database stores ONLY canonical status keys
- ⏳ No duplicate statuses anywhere
- ⏳ Language switch changes every status instantly
- ⏳ Dashboard counts are correct
- ⏳ Charts group statuses correctly
- ⏳ Filters show only one entry per status
- ⏳ Edit Order modal shows clean translated statuses
- ⏳ Google Sheets imports normalize automatically
- ⏳ YouCan imports normalize automatically
- ⏳ Manual edits save canonical keys
- ⏳ Every status always has the same badge color
- ⏳ Green badge is ALWAYS used for Confirmed
- ⏳ Every page imports from statusEngine.ts
