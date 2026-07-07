# DAC7 Integration Guide

This document explains how to integrate the DAC7 project with the unified owner management system.

## Overview

The owner management system provides a centralized database of approved property owners. The DAC7 project can query this database to validate owner access without maintaining a separate owner list.

## Database Connection

Use the same Supabase instance. Connection details are in the `.env` file:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## Available Functions

### 1. Check if Owner Email is Approved for DAC7

```javascript
const { data, error } = await supabase.rpc('check_owner_email_approved', {
  check_email: 'owner@example.com',
  check_type: 'dac7'
});

// Returns: true or false
```

### 2. Get Owner Details by Email

```javascript
const { data, error } = await supabase.rpc('get_owner_by_email', {
  check_email: 'owner@example.com'
});

// Returns:
// {
//   id: 'uuid',
//   email: 'owner@example.com',
//   full_name: 'John Smith',
//   company_name: 'Acme Ltd',
//   approved_for_dac7: true,
//   approved_for_portal: true
// }
```

### 3. Direct Table Query (if needed)

```javascript
const { data, error } = await supabase
  .from('owners')
  .select('*')
  .eq('email', 'owner@example.com')
  .eq('approved_for_dac7', true)
  .maybeSingle();
```

## Usage Example in DAC7

```javascript
// When user tries to access DAC7 reports
async function checkDac7Access(userEmail) {
  const { data: isApproved, error } = await supabase.rpc('check_owner_email_approved', {
    check_email: userEmail,
    check_type: 'dac7'
  });

  if (error) {
    console.error('Error checking DAC7 access:', error);
    return false;
  }

  return isApproved;
}

// In your DAC7 auth flow
const hasAccess = await checkDac7Access('owner@example.com');
if (!hasAccess) {
  // Show access denied message
  return;
}

// Proceed with showing DAC7 reports
```

## Admin Management

Admins manage all owner approvals in the main application at:
- Navigate to Admin Panel > Owner Management
- Add new owners with email, name, company details
- Toggle DAC7 approval with one click
- Toggle Portal approval independently

## Benefits

1. **Single Source of Truth**: One place to manage all owner access
2. **No Duplication**: Add owner once, use in both systems
3. **Real-time Updates**: Changes in admin panel immediately affect DAC7 access
4. **Audit Trail**: All changes tracked with timestamps
5. **Flexible Permissions**: DAC7 and Portal access controlled independently

## Migration from Old System

If you have an existing list of approved DAC7 emails:

```sql
-- Bulk insert existing DAC7 approved emails
INSERT INTO owners (email, approved_for_dac7, approved_for_portal)
VALUES
  ('owner1@example.com', true, false),
  ('owner2@example.com', true, false),
  ('owner3@example.com', true, true)
ON CONFLICT (email) DO UPDATE
SET approved_for_dac7 = true;
```

## Security

- RPC functions use `SECURITY DEFINER` to safely query owner data
- Email validation is case-insensitive
- No sensitive data exposed to unauthorized users
- All queries go through Row Level Security policies

## Support

For questions or issues, contact the admin team or check the database migration files in:
`supabase/migrations/create_unified_owners_master_table.sql`
