# Authentication System - Test Plan

## E2E Test Plan (Playwright)

### Test File: `tests/auth.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  const baseURL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  test('Complete registration and login flow', async ({ page }) => {
    // 1. Navigate to registration page
    await page.goto(`${baseURL}/register`);
    await expect(page.locator('h2')).toContainText('Create your account');

    // 2. Fill registration form
    const timestamp = Date.now();
    const email = `test${timestamp}@example.com`;
    const password = 'TestPassword123!';

    await page.fill('input[name="email"]', email);
    await page.fill('input[name="password"]', password);
    await page.fill('input[name="confirmPassword"]', password);
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');

    // 3. Submit registration
    await page.click('button[type="submit"]');
    
    // 4. Should redirect to account page
    await page.waitForURL('**/account');
    await expect(page.locator('h1')).toContainText('My Account');

    // 5. Logout
    await page.click('button:has-text("Sign Out")');
    await page.waitForURL('**/');

    // 6. Login with registered credentials
    await page.goto(`${baseURL}/login`);
    await page.fill('input[name="username"]', email);
    await page.fill('input[name="password"]', password);
    await page.click('button[type="submit"]');

    // 7. Should be logged in and redirected
    await page.waitForURL('**/account');
    await expect(page.locator('h1')).toContainText('My Account');
  });

  test('Forgot password and reset flow', async ({ page }) => {
    // 1. Navigate to forgot password page
    await page.goto(`${baseURL}/forgot`);
    await expect(page.locator('h2')).toContainText('Reset your password');

    // 2. Submit forgot password form
    await page.fill('input[name="email"]', 'test@example.com');
    await page.click('button[type="submit"]');

    // 3. Should show success message
    await expect(page.locator('text=Check your email')).toBeVisible();

    // 4. Navigate to reset page with token (simulate email link)
    // Note: In real test, you'd need to extract token from email
    const resetToken = 'test-reset-token';
    await page.goto(`${baseURL}/reset?token=${resetToken}&email=test@example.com`);

    // 5. Fill reset form
    const newPassword = 'NewPassword123!';
    await page.fill('input[name="password"]', newPassword);
    await page.fill('input[name="confirmPassword"]', newPassword);
    await page.click('button[type="submit"]');

    // 6. Should redirect to login
    await page.waitForURL('**/login');
  });

  test('Protected route redirects to login', async ({ page }) => {
    // 1. Try to access protected route without auth
    await page.goto(`${baseURL}/account`);

    // 2. Should redirect to login with next parameter
    await page.waitForURL('**/login?next=/account');
    await expect(page.locator('h2')).toContainText('Sign in');
  });

  test('Invalid login credentials show error', async ({ page }) => {
    await page.goto(`${baseURL}/login`);
    await page.fill('input[name="username"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    // Should show error message
    await expect(page.locator('text=/invalid|error/i')).toBeVisible();
  });

  test('Rate limiting works', async ({ page }) => {
    await page.goto(`${baseURL}/login`);
    
    // Attempt login 6 times (limit is 5)
    for (let i = 0; i < 6; i++) {
      await page.fill('input[name="username"]', 'test@example.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(500);
    }

    // Should show rate limit error
    await expect(page.locator('text=/too many|rate limit/i')).toBeVisible();
  });
});
```

## Unit Test Plan (Jest)

### Test File: `tests/auth.test.ts`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import RegisterForm from '@/components/auth/RegisterForm';
import axios from 'axios';

jest.mock('next/navigation');
jest.mock('axios');
jest.mock('@/components/ToastProvider', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('LoginForm', () => {
  const mockPush = jest.fn();
  
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      push: mockPush,
    });
  });

  test('validates required fields', async () => {
    render(<LoginForm />);
    
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/username.*required/i)).toBeInTheDocument();
      expect(screen.getByText(/password.*required/i)).toBeInTheDocument();
    });
  });

  test('submits form with valid data', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { user: { id: 1, email: 'test@example.com' } },
    });

    render(<LoginForm />);
    
    fireEvent.change(screen.getByLabelText(/username/i), {
      target: { value: 'test@example.com' },
    });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'password123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/auth/login', {
        username: 'test@example.com',
        password: 'password123',
      });
    });
  });
});

describe('RegisterForm', () => {
  test('validates password match', async () => {
    render(<RegisterForm />);
    
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: 'password123' },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: 'different' },
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords must match/i)).toBeInTheDocument();
    });
  });

  test('validates password length', async () => {
    render(<RegisterForm />);
    
    fireEvent.change(screen.getByLabelText(/^password/i), {
      target: { value: '12345' }, // Less than 6 characters
    });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/at least 6 characters/i)).toBeInTheDocument();
    });
  });
});
```

## Manual Testing Checklist

### Registration Flow
- [ ] Navigate to `/register`
- [ ] Fill all required fields
- [ ] Submit form
- [ ] Verify redirect to `/account`
- [ ] Verify user data displayed correctly
- [ ] Test validation errors (empty fields, invalid email, weak password)
- [ ] Test password mismatch validation

### Login Flow
- [ ] Navigate to `/login`
- [ ] Enter valid credentials
- [ ] Submit form
- [ ] Verify redirect to `/account` or `next` parameter
- [ ] Test invalid credentials (should show generic error)
- [ ] Test empty fields validation
- [ ] Test "Remember me" checkbox (if implemented)

### Forgot Password Flow
- [ ] Navigate to `/forgot`
- [ ] Enter email address
- [ ] Submit form
- [ ] Verify success message displayed
- [ ] Check email for reset link
- [ ] Click reset link
- [ ] Verify redirect to `/reset` with token and email

### Reset Password Flow
- [ ] Navigate to `/reset` with valid token
- [ ] Enter new password
- [ ] Confirm password
- [ ] Submit form
- [ ] Verify redirect to `/login`
- [ ] Test login with new password
- [ ] Test invalid/expired token handling
- [ ] Test password mismatch validation

### Protected Routes
- [ ] Access `/account` without login (should redirect)
- [ ] Access `/checkout` without login (should redirect)
- [ ] Access `/orders` without login (should redirect)
- [ ] After login, access protected routes (should work)
- [ ] Test logout functionality
- [ ] After logout, access protected routes (should redirect)

### Session Management
- [ ] Login and refresh page (session should persist)
- [ ] Login and close browser, reopen (session should persist if "Remember me")
- [ ] Test token expiration handling
- [ ] Test logout clears session

### Security
- [ ] Test rate limiting (5 attempts should block)
- [ ] Test reCAPTCHA (if enabled)
- [ ] Verify JWT token not exposed in client-side code
- [ ] Verify HttpOnly cookie is set
- [ ] Test CSRF protection (if implemented)

## Performance Testing

- [ ] Login response time < 500ms
- [ ] Registration response time < 1s
- [ ] Protected route middleware overhead < 100ms
- [ ] Token validation response time < 200ms

## Browser Compatibility

Test on:
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Safari (iOS)
- [ ] Chrome Mobile (Android)

## Accessibility Testing

- [ ] All forms have proper labels
- [ ] Error messages are announced to screen readers
- [ ] Keyboard navigation works
- [ ] Focus management is correct
- [ ] Color contrast meets WCAG AA standards

## Integration Testing

- [ ] WordPress JWT plugin is installed and configured
- [ ] Custom PHP endpoints are registered
- [ ] Email sending works (for password reset)
- [ ] Cookie settings work in production (HTTPS)
- [ ] Rate limiting works across multiple requests

