/**
 * GraphQL Client for WordPress/WooCommerce
 * 
 * Requires WPGraphQL and WooGraphQL plugins on WordPress
 * 
 * Setup:
 * 1. Install WPGraphQL plugin: https://www.wpgraphql.com/
 * 2. Install WooGraphQL plugin: https://woographql.com/
 * 3. Configure GraphQL endpoint in .env: NEXT_PUBLIC_GRAPHQL_URL
 */

import { isAbortError } from '@/lib/utils/errors';

const GRAPHQL_URL = process.env.NEXT_PUBLIC_GRAPHQL_URL || 
  (process.env.WC_API_URL 
    ? process.env.WC_API_URL.replace('/wp-json/wc/v3', '/graphql')
    : null);

if (!GRAPHQL_URL && typeof window === 'undefined') {
  console.warn('[GraphQL] NEXT_PUBLIC_GRAPHQL_URL not configured. GraphQL features will be disabled.');
}

interface GraphQLOptions {
  variables?: Record<string, any>;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * Execute GraphQL query
 */
export async function graphqlQuery<T = any>(
  query: string,
  options: GraphQLOptions = {}
): Promise<T> {
  if (!GRAPHQL_URL) {
    throw new Error('GraphQL URL not configured');
  }

  const { variables = {}, headers = {}, timeout = 20000 } = options;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
      signal: controller?.signal,
      cache: 'no-store',
    }).finally(() => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
    }

    return result.data as T;
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error('GraphQL request timeout');
    }
    throw error;
  }
}

/**
 * Execute GraphQL mutation
 */
export async function graphqlMutation<T = any>(
  mutation: string,
  options: GraphQLOptions = {}
): Promise<T> {
  return graphqlQuery<T>(mutation, options);
}

/**
 * Check if GraphQL is available
 */
export function isGraphQLAvailable(): boolean {
  return !!GRAPHQL_URL;
}

