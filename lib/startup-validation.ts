/**
 * Startup Validation
 * Validates environment variables and configuration at application startup
 * This runs before the app starts to catch configuration errors early
 */

import { validateEnvironmentVariables } from './env-validation';

let validated = false;

/**
 * Validate environment and configuration at startup
 * Call this in your app initialization
 */
export function validateStartup(): void {
  if (validated) {
    return; // Only validate once
  }

  // Validate environment variables
  const envResult = validateEnvironmentVariables();
  
  if (!envResult.valid) {
    const errors: string[] = [];
    
    if (envResult.missing.length > 0) {
      errors.push(`Missing required environment variables: ${envResult.missing.join(', ')}`);
    }
    
    if (envResult.invalid.length > 0) {
      const invalidMessages = envResult.invalid.map(
        (item) => `${item.name}: ${item.reason}`
      );
      errors.push(`Invalid environment variables:\n  ${invalidMessages.join('\n  ')}`);
    }

    const errorMessage = `\n❌ Environment Validation Failed:\n${errors.join('\n')}\n\nPlease check your .env.local file.\n`;
    
    // In production, throw error to prevent startup
    if (process.env.NODE_ENV === 'production') {
      throw new Error(errorMessage);
    }
    
    // In development, log warning but allow startup
    console.warn(errorMessage);
  }

  validated = true;
}

/**
 * Get validation status
 */
export function isStartupValidated(): boolean {
  return validated;
}

