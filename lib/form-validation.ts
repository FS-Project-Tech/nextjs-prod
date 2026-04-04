/**
 * Shared form validation utilities for name, email, and phone (AU format).
 * Used by AddressForm, Checkout, Register, and Login.
 */

export const NAME_REGEX = /^[a-zA-Z\s\-']+$/;
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Letters, spaces, hyphens, apostrophes only; no numbers */
export function isValidName(value: string): boolean {
  if (!value?.trim()) return true;
  return NAME_REGEX.test(value.trim());
}

/** Valid email format */
export function isValidEmail(value: string): boolean {
  if (!value?.trim()) return true;
  return EMAIL_REGEX.test(value.trim());
}

/** Australian phone: digits only, 8–10 digits */
export function isValidAuPhone(value: string): boolean {
  if (!value?.trim()) return true;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 10;
}

/** Strip non-digits from phone input */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Strip invalid characters from name input (letters, spaces, hyphens, apostrophes) */
export function nameCharsOnly(value: string): string {
  return value.replace(/[^a-zA-Z\s\-']/g, "");
}
