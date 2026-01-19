# Phase 6: Billing Integration

## Overview
Integrated Shopify native billing for subscription upgrades.

## Tasks Completed

### Task 6.1: Create Upgrade Page
- `app/routes/app.upgrade.tsx`
- Plan comparison table:
  | Plan | Price | Videos/Month |
  |------|-------|--------------|
  | Trial | Free | 1 |
  | Basic | $19/mo | 20 |
  | Pro | $49/mo | 100 |
- Current plan highlighted
- Upgrade buttons for Basic and Pro
- Uses Shopify appSubscriptionCreate mutation
- Redirects to Shopify billing confirmation page

### Task 6.2: Create Billing Callback Route
- `app/routes/app.billing.callback.tsx`
- Handles return from Shopify billing confirmation
- Verifies charge was accepted via GraphQL
- Updates shop plan in database
- Redirects to dashboard with success toast

## Files Created
```
app/routes/
  app.upgrade.tsx
  app.billing.callback.tsx
```

## Billing Flow
```
1. User clicks "Upgrade to Pro" on /app/upgrade
2. App creates RecurringApplicationCharge via Shopify API
3. User redirected to Shopify billing confirmation
4. User approves/declines
5. Shopify redirects to /app/billing/callback
6. App verifies charge, updates plan
7. User redirected to dashboard
```

## GraphQL Mutations Used
- `appSubscriptionCreate` - create subscription charge
- `node` query - verify charge status
