/**
 * reCAPTCHA v3 validation
 * Requires NEXT_PUBLIC_RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY in .env
 */

const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY;
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/**
 * Verify reCAPTCHA token
 * @param token - reCAPTCHA token from client
 * @returns true if valid, false otherwise
 */
export async function verifyRecaptcha(token: string): Promise<boolean> {
  if (!RECAPTCHA_SECRET_KEY) {
    // If not configured, skip verification (for development)
    console.warn('reCAPTCHA secret key not configured. Skipping verification.');
    return true;
  }

  if (!token) {
    return false;
  }

  try {
    const response = await fetch(RECAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `secret=${RECAPTCHA_SECRET_KEY}&response=${token}`,
    });

    const data = await response.json();
    
    // Score threshold (0.0 to 1.0, higher is better)
    // 0.5 is a reasonable threshold
    return data.success === true && (data.score || 0) >= 0.5;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error);
    return false;
  }
}

