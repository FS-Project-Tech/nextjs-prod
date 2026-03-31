# Cookie Settings Configuration

## Overview

All cookies in the application are configured with the following settings for cross-site compatibility:

- **httpOnly**: `true` (for security cookies)
- **secure**: `true` (always, required for SameSite=None)
- **sameSite**: `"none"` (for cross-site requests)
- **path**: `"/"` (available site-wide)

## Cookie Types

### 1. Session Cookie (`session`)
- **Name**: `session`
- **Purpose**: Stores JWT authentication token
- **Settings**:
  - `httpOnly: true`
  - `secure: true`
  - `sameSite: "none"`
  - `path: "/"`
  - `maxAge: 3600` (1 hour)

**Location**: `lib/auth.ts` - `setAuthToken()`

### 2. CSRF Token Cookie (`csrf-token`)
- **Name**: `csrf-token`
- **Purpose**: CSRF protection token (accessible to JavaScript)
- **Settings**:
  - `httpOnly: false` (needs to be accessible to JavaScript)
  - `secure: true`
  - `sameSite: "none"`
  - `path: "/"`
  - `maxAge: 3600` (1 hour)

**Location**: `lib/auth.ts` - `setAuthToken()`

### 3. WooCommerce Session Cookie (`wc-session`)
- **Name**: `wc-session`
- **Purpose**: WooCommerce cart session management
- **Settings**:
  - `httpOnly: true`
  - `secure: true`
  - `sameSite: "none"`
  - `path: "/"`
  - `maxAge: 172800` (48 hours)

**Location**: `lib/woocommerce-session.ts` - `setWCSessionCookie()`

### 4. Wishlist Cookie (`wishlist`)
- **Name**: `wishlist`
- **Purpose**: Client-side wishlist storage
- **Settings**:
  - `httpOnly: false` (client-side only)
  - `secure: true` (when on HTTPS)
  - `sameSite: "none"`
  - `path: "/"`

**Location**: `lib/wishlist-cookies.ts` - `saveWishlistToCookie()`

## Why SameSite=None?

`SameSite=None` is required when:
- Your Next.js frontend and WordPress backend are on different domains
- You need cookies to work across subdomains
- You're using a headless architecture with separate frontend/backend

**Important**: When using `SameSite=None`, `secure: true` is **mandatory**. Browsers will reject cookies with `SameSite=None` if they're not secure.

## WordPress Plugin Cookie Settings

The WordPress plugin (`wp-plugin/custom-auth-bridge.php`) also sets cookies with:
- `secure: true`
- `httponly: true`
- `samesite: 'None'`
- `path: '/'`

## Cookie Deletion

When deleting cookies, you must use the **same settings** as when setting them. This ensures proper cross-site cookie deletion.

**Example**:
```typescript
// Setting cookie
cookieStore.set('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
});

// Deleting cookie (must use same settings)
cookieStore.set('session', '', {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: 0, // Expire immediately
  path: '/',
});
```

## Testing Cookie Settings

### Browser DevTools
1. Open DevTools → Application → Cookies
2. Verify cookies have:
   - ✅ Secure flag
   - ✅ HttpOnly flag (for security cookies)
   - ✅ SameSite=None
   - ✅ Path=/

### Network Tab
1. Open DevTools → Network
2. Check request headers for `Cookie:` header
3. Verify cookies are being sent with requests

### Console
```javascript
// Check if cookies are accessible (only non-HttpOnly cookies)
console.log(document.cookie);
```

## Troubleshooting

### Cookies Not Being Set
- **Check HTTPS**: `secure: true` requires HTTPS
- **Check domain**: Ensure cookie domain matches your site
- **Check browser**: Some browsers block third-party cookies

### Cookies Not Being Sent
- **Check SameSite**: Must be `None` for cross-site
- **Check Secure**: Must be `true` when SameSite=None
- **Check CORS**: Ensure CORS headers allow credentials

### Cookies Being Blocked
- **Browser settings**: Check if third-party cookies are blocked
- **Privacy settings**: Some browsers block cross-site cookies
- **HTTPS required**: SameSite=None requires HTTPS

## Security Considerations

1. **HttpOnly**: Prevents JavaScript access to sensitive cookies (session tokens)
2. **Secure**: Ensures cookies only sent over HTTPS
3. **SameSite=None**: Required for cross-site, but less secure than `Strict` or `Lax`
4. **Path**: Restricts cookie to specific paths (we use `/` for site-wide)

## Production Checklist

- [ ] All cookies use `secure: true`
- [ ] Security cookies use `httpOnly: true`
- [ ] All cookies use `sameSite: "none"`
- [ ] All cookies use `path: "/"`
- [ ] HTTPS is enabled on both frontend and backend
- [ ] CORS is properly configured
- [ ] Cookie deletion uses same settings as setting

