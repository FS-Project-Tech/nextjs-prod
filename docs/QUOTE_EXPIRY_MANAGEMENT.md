# Step 7: Quote Expiry Management - Implementation Complete ✅

## What Was Implemented

### 1. Expiry Checking Utilities (`lib/quote-expiry.ts`)
- `isQuoteExpired()` - Check if quote has expired
- `getDaysUntilExpiry()` - Calculate days until expiry
- `isExpiringSoon()` - Check if quote expires within X days
- `getExpiryStatus()` - Get detailed expiry status with messages
- `checkAndUpdateExpiredQuotes()` - Check and update expired quotes for a user
- `checkAllExpiredQuotes()` - Check all quotes (admin/cron)
- `renewQuote()` - Extend quote expiry date

### 2. Expiry Check API (`app/api/quotes/expiry/check/route.ts`)
- **POST/GET** endpoint to check and update expired quotes
- Supports user-specific checking (their own quotes)
- Supports admin checking (all quotes with `?all=true`)
- Cron-friendly GET endpoint with secret authentication
- Returns statistics: checked, expired, updated, errors

### 3. Quote Renewal API (`app/api/dashboard/quotes/[id]/renew/route.ts`)
- **POST** endpoint to renew/extend quote expiry
- Validates ownership (users can renew their own quotes)
- Admins can renew any quote
- Configurable additional days (1-365)
- Updates quote expiry date and metadata

### 4. UI Enhancements

#### Quote List Page (`app/dashboard/quotes/page.tsx`)
- Color-coded expiry dates:
  - **Red** - Expired
  - **Yellow** - Expiring soon (within 7 days)
  - **Gray** - Valid
- Shows expiry status message
- Visual warnings for expiring/expired quotes

#### Quote Detail Page (`app/dashboard/quotes/[id]/page.tsx`)
- Detailed expiry information
- Color-coded expiry warnings
- "Renew Quote" button for valid quotes
- Extends quote by 30 days
- Loading states during renewal

## Features

✅ **Automatic Expiry Detection** - Checks quotes and updates status
✅ **Expiry Warnings** - Visual indicators for expiring quotes
✅ **Email Notifications** - Sends expiry emails (from Step 6)
✅ **Quote Renewal** - Users can extend quote validity
✅ **Cron Support** - API endpoint for scheduled checking
✅ **Status Updates** - Automatically sets status to 'expired'
✅ **Permission Control** - Users can only renew their own quotes

## Expiry Status Types

### Valid
- Quote has not expired
- More than 7 days until expiry
- Green/gray indicators

### Expiring Soon
- Quote expires within 7 days
- Yellow warning indicators
- Shows days remaining

### Expired
- Quote has passed expiry date
- Red indicators
- Status automatically updated to 'expired'
- Email notification sent

## API Endpoints

### Check Expired Quotes
```
POST /api/quotes/expiry/check
GET /api/quotes/expiry/check?secret=xxx&all=true
```

**Response:**
```json
{
  "success": true,
  "checked": 10,
  "expired": 2,
  "updated": 2,
  "errors": 0,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Renew Quote
```
POST /api/dashboard/quotes/[id]/renew
Body: { "additionalDays": 30 }
```

**Response:**
```json
{
  "success": true,
  "quote": { ... },
  "message": "Quote renewed for 30 additional days",
  "newExpiryDate": "2024-02-01T00:00:00.000Z"
}
```

## Cron Job Setup

### Option 1: Vercel Cron (if using Vercel)
Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/quotes/expiry/check?secret=YOUR_SECRET&all=true",
    "schedule": "0 0 * * *"
  }]
}
```

### Option 2: External Cron Service
Set up a cron job to call:
```
GET https://yoursite.com/api/quotes/expiry/check?secret=YOUR_SECRET&all=true
```

**Recommended Schedule:**
- Daily at midnight: `0 0 * * *`
- Or every 6 hours: `0 */6 * * *`

### Option 3: WordPress Cron
Add to WordPress `functions.php` or a plugin:
```php
add_action('wp', function() {
    if (!wp_next_scheduled('check_expired_quotes')) {
        wp_schedule_event(time(), 'daily', 'check_expired_quotes');
    }
});

add_action('check_expired_quotes', function() {
    $secret = get_option('quote_expiry_check_secret');
    wp_remote_get(
        'https://yoursite.com/api/quotes/expiry/check?secret=' . $secret . '&all=true'
    );
});
```

## Environment Variables

```env
# Secret for cron job authentication
QUOTE_EXPIRY_CHECK_SECRET=your-secret-key-here
```

## User Experience

### Quote List
- Users see color-coded expiry dates
- Expiring quotes show warning messages
- Expired quotes clearly marked in red

### Quote Detail
- Detailed expiry information
- One-click renewal button
- Visual warnings for expiring/expired quotes
- Clear messaging about expiry status

### Automatic Updates
- Quotes automatically marked as expired
- Email notifications sent (from Step 6)
- Status history updated with expiry event

## Security

- ✅ Authentication required for manual checks
- ✅ Secret-based authentication for cron jobs
- ✅ Permission checks for quote renewal
- ✅ Users can only renew their own quotes
- ✅ Admins can renew any quote
- ✅ Input validation (1-365 days)

## Future Enhancements

Potential improvements:
- Custom expiry periods per quote
- Expiry reminders (email before expiry)
- Automatic renewal options
- Bulk renewal
- Expiry analytics
- Grace period after expiry
- Quote extension requests

## Testing Checklist

- [ ] Check expired quotes API works
- [ ] Renew quote API works
- [ ] Expiry warnings show correctly
- [ ] Expired quotes marked in red
- [ ] Expiring soon quotes marked in yellow
- [ ] Renewal button works
- [ ] Permission checks work
- [ ] Cron endpoint accessible with secret
- [ ] Email notifications sent on expiry
- [ ] Status automatically updated to expired

