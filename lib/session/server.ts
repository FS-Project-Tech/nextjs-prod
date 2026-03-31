/**
 * Server-Side Session Utilities
 * Use these in Server Components and API routes
 */

import { cookies } from 'next/headers';
import {
  SessionData,
  SessionType,
  SessionStatus,
  SessionUser,
} from './types';
import {
  createSession,
  validateSession,
  getTokenExpiry,
} from './manager';
import { getWpBaseUrl } from '../wp-utils';

const SESSION_COOKIE = 'session';
const CSRF_COOKIE = 'csrf-token';

/**
 * Get session from cookies (Server Component safe)
 */
export async function getServerSession(): Promise<SessionData | null> {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(SESSION_COOKIE)?.value;
    const csrfToken = cookieStore.get(CSRF_COOKIE)?.value;
    
    if (!sessionToken) {
      return null;
    }
    
    // Create session from token
    const session = createSession(SessionType.AUTH, {
      token: sessionToken,
    });
    
    if (csrfToken) {
      session.csrfToken = csrfToken;
    }
    
    // Check token expiry
    const expiry = getTokenExpiry(sessionToken);
    if (expiry) {
      session.expiresAt = expiry;
      
      if (Date.now() >= expiry) {
        session.status = SessionStatus.EXPIRED;
      }
    }
    
    return session;
  } catch (error) {
    // cookies() can throw in certain contexts
    console.debug('getServerSession error:', error);
    return null;
  }
}

/**
 * Validate server session with WordPress
 */
export async function validateServerSession(): Promise<{
  valid: boolean;
  session: SessionData | null;
  user: SessionUser | null;
}> {
  const session = await getServerSession();
  
  if (!session?.token) {
    return { valid: false, session: null, user: null };
  }
  
  // Validate with WordPress
  const wpBase = getWpBaseUrl();
  if (!wpBase) {
    return { valid: false, session, user: null };
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`${wpBase}/wp-json/jwt-auth/v1/token/validate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      session.status = SessionStatus.INVALID;
      return { valid: false, session, user: null };
    }
    
    // Fetch user data
    const userResponse = await fetch(`${wpBase}/wp-json/wp/v2/users/me`, {
      headers: {
        'Authorization': `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });
    
    if (!userResponse.ok) {
      return { valid: true, session, user: null };
    }
    
    const userData = await userResponse.json();
    
    const user: SessionUser = {
      id: userData.id,
      email: userData.email || '',
      name: userData.name || userData.display_name || '',
      username: userData.slug || userData.user_login || '',
      roles: userData.roles || [],
    };
    
    session.user = user;
    session.status = SessionStatus.VALID;
    
    return { valid: true, session, user };
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('validateServerSession error:', error);
    }
    return { valid: false, session, user: null };
  }
}

/**
 * Check if user is authenticated (quick check, no validation)
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getServerSession();
  return !!(session?.token && session.status !== SessionStatus.EXPIRED);
}

/**
 * Get user ID from session (quick check, no validation)
 */
export async function getSessionUserId(): Promise<number | null> {
  const session = await getServerSession();
  return session?.user?.id || null;
}

/**
 * Check if session has specific role
 */
export async function hasRole(role: string): Promise<boolean> {
  const session = await getServerSession();
  return session?.user?.roles?.includes(role) ?? false;
}

/**
 * Check if session is admin
 */
export async function isAdmin(): Promise<boolean> {
  return hasRole('administrator');
}

/**
 * Require authentication (throws if not authenticated)
 */
export async function requireAuth(): Promise<SessionData> {
  const { valid, session, user } = await validateServerSession();
  
  if (!valid || !session) {
    throw new Error('Authentication required');
  }
  
  return session;
}

/**
 * Require specific role (throws if not authorized)
 */
export async function requireRole(role: string): Promise<SessionData> {
  const session = await requireAuth();
  
  if (!session.user?.roles?.includes(role)) {
    throw new Error(`Role '${role}' required`);
  }
  
  return session;
}

