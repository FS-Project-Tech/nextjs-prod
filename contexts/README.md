# Auth Context

Centralized authentication context for managing global auth state.

## Features

- ✅ Global authentication state management
- ✅ Session validation on app startup
- ✅ Token expiration and automatic refresh
- ✅ Cross-tab/window synchronization
- ✅ Error state handling
- ✅ TypeScript support
- ✅ Login/logout functions
- ✅ Session timeout handling

## Usage

### 1. Wrap your app with AuthProvider

In `app/layout.tsx`:

```tsx
import { AuthProvider } from '@/contexts/AuthContext';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
```

### 2. Use the useAuth hook

```tsx
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { 
    user, 
    isAuthenticated, 
    isLoading, 
    login, 
    logout,
    error 
  } = useAuth();

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <button onClick={() => login('user', 'pass')}>Login</button>;
  }

  return (
    <div>
      <p>Welcome, {user?.name}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

## API Reference

### AuthContextType

```typescript
interface AuthContextType {
  // State
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  status: 'loading' | 'authenticated' | 'unauthenticated' | 'error';
  error: AuthError | null;
  
  // Actions
  login: (username: string, password: string, redirectTo?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  validateSession: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearError: () => void;
}
```

### Methods

#### `login(username, password, redirectTo?)`
Authenticates user and updates state.

```tsx
const { login } = useAuth();
const result = await login('username', 'password', '/dashboard');
if (result.success) {
  // User logged in
} else {
  // Handle error: result.error
}
```

#### `logout()`
Logs out user and clears state.

```tsx
const { logout } = useAuth();
await logout();
```

#### `validateSession()`
Manually validate current session.

```tsx
const { validateSession } = useAuth();
await validateSession();
```

#### `refreshSession()`
Refresh session token.

```tsx
const { refreshSession } = useAuth();
await refreshSession();
```

#### `clearError()`
Clear error state.

```tsx
const { clearError, error } = useAuth();
if (error) {
  clearError();
}
```

## Features

### Automatic Session Management

- Validates session on app load
- Automatically refreshes tokens before expiration (every 50 minutes)
- Validates session periodically (every 5 minutes)
- Handles token expiration gracefully

### Cross-Tab Synchronization

- Login/logout in one tab syncs to all tabs
- Session refresh in one tab updates all tabs
- Uses localStorage events for synchronization

### Error Handling

- Network errors handled gracefully
- Timeout errors don't crash the app
- Clear error messages for users
- Error state can be cleared manually

### TypeScript Support

- Fully typed interfaces
- Type-safe user object
- Type-safe error handling

## Migration from Old AuthProvider

If you're migrating from `components/AuthProvider.tsx`:

1. Replace the import in `app/layout.tsx`:
   ```tsx
   // Old
   import { AuthProvider } from '@/components/AuthProvider';
   
   // New
   import { AuthProvider } from '@/contexts/AuthContext';
   ```

2. Update `useAuth` imports:
   ```tsx
   // Old
   import { useAuth } from '@/components/AuthProvider';
   
   // New
   import { useAuth } from '@/contexts/AuthContext';
   ```

3. The API is mostly compatible, but now includes:
   - `isAuthenticated` boolean (instead of checking `status === 'authenticated'`)
   - `login()` function (previously handled in LoginForm)
   - `error` state for better error handling
   - `clearError()` function

