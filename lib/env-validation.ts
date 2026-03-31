/**
 * Environment Variable Validation
 * Validates required environment variables at startup
 */

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  invalid: Array<{ name: string; reason: string }>;
}

/**
 * Validate required environment variables
 */
export function validateEnvironmentVariables(): EnvValidationResult {
  const missing: string[] = [];
  const invalid: Array<{ name: string; reason: string }> = [];

  // Required variables
  const required = {
    'WC_API_URL': {
      validate: (value: string) => {
        if (!value) return 'Missing';
        try {
          const url = new URL(value);
          if (!url.protocol.startsWith('http')) {
            return 'Must be HTTP or HTTPS URL';
          }
          return null;
        } catch {
          return 'Invalid URL format';
        }
      },
    },
    'WC_CONSUMER_KEY': {
      validate: (value: string) => {
        if (!value) return 'Missing';
        if (!value.startsWith('ck_')) {
          return 'Consumer key should start with "ck_"';
        }
        return null;
      },
    },
    'WC_CONSUMER_SECRET': {
      validate: (value: string) => {
        if (!value) return 'Missing';
        if (!value.startsWith('cs_')) {
          return 'Consumer secret should start with "cs_"';
        }
        return null;
      },
    },
  };

  // Validate each required variable
  for (const [name, config] of Object.entries(required)) {
    const value = process.env[name];
    if (!value) {
      missing.push(name);
      continue;
    }

    const error = config.validate(value);
    if (error) {
      invalid.push({ name, reason: error });
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate and throw if invalid (for server-side use)
 */
export function requireEnvironmentVariables(): void {
  const result = validateEnvironmentVariables();

  if (!result.valid) {
    const errors: string[] = [];

    if (result.missing.length > 0) {
      errors.push(`Missing variables: ${result.missing.join(', ')}`);
    }

    if (result.invalid.length > 0) {
      const invalidMessages = result.invalid.map(
        (item) => `${item.name}: ${item.reason}`
      );
      errors.push(`Invalid variables: ${invalidMessages.join('; ')}`);
    }

    throw new Error(
      `Environment variable validation failed:\n${errors.join('\n')}`
    );
  }
}

/**
 * Get validated environment variable or throw
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

