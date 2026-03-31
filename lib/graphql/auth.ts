/**
 * WooGraphQL Authentication
 * 
 * GraphQL-based authentication with JWT tokens
 * Requires: WPGraphQL + WPGraphQL JWT Authentication plugins
 * 
 * @see https://www.wpgraphql.com/
 * @see https://github.com/wp-graphql/wp-graphql-jwt-authentication
 */

import { graphqlQuery, graphqlMutation, isGraphQLAvailable } from './client';

// ============================================================================
// Types
// ============================================================================

export interface GraphQLUser {
  id: string;
  databaseId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  username: string;
  name: string | null;
  roles?: {
    nodes: { name: string }[];
  };
}

export interface LoginResult {
  authToken: string;
  refreshToken: string;
  user: GraphQLUser;
  sessionToken?: string;
}

export interface RefreshResult {
  authToken: string;
}

export interface RegisterResult {
  user: GraphQLUser;
}

export interface CustomerResult {
  id: string;
  databaseId: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  billing?: {
    address1: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
  };
}

// ============================================================================
// GraphQL Mutations
// ============================================================================

const LOGIN_MUTATION = `
  mutation LoginUser($username: String!, $password: String!) {
    login(input: { username: $username, password: $password }) {
      authToken
      refreshToken
      sessionToken
      user {
        id
        databaseId
        email
        firstName
        lastName
        username
        name
        roles {
          nodes {
            name
          }
        }
      }
    }
  }
`;

const REFRESH_TOKEN_MUTATION = `
  mutation RefreshAuthToken($refreshToken: String!) {
    refreshJwtAuthToken(input: { jwtRefreshToken: $refreshToken }) {
      authToken
    }
  }
`;

const REGISTER_USER_MUTATION = `
  mutation RegisterUser(
    $username: String!
    $email: String!
    $password: String!
    $firstName: String
    $lastName: String
  ) {
    registerUser(
      input: {
        username: $username
        email: $email
        password: $password
        firstName: $firstName
        lastName: $lastName
      }
    ) {
      user {
        id
        databaseId
        email
        firstName
        lastName
        username
        name
      }
    }
  }
`;

const GET_VIEWER_QUERY = `
  query GetViewer {
    viewer {
      id
      databaseId
      email
      firstName
      lastName
      username
      name
      roles {
        nodes {
          name
        }
      }
    }
  }
`;

const GET_CUSTOMER_QUERY = `
  query GetCustomer {
    customer {
      id
      databaseId
      email
      firstName
      lastName
      billing {
        address1
        city
        state
        postcode
        country
      }
    }
  }
`;

// ============================================================================
// Auth Functions
// ============================================================================

/**
 * Login via GraphQL
 */
export async function graphqlLogin(
  username: string,
  password: string
): Promise<LoginResult> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL is not available');
  }

  const data = await graphqlMutation<{ login: LoginResult }>(LOGIN_MUTATION, {
    variables: { username, password },
    timeout: 15000,
  });

  if (!data?.login?.authToken) {
    throw new Error('Login failed: No auth token received');
  }

  return data.login;
}

/**
 * Refresh JWT token via GraphQL
 */
export async function graphqlRefreshToken(
  refreshToken: string
): Promise<string> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL is not available');
  }

  const data = await graphqlMutation<{ refreshJwtAuthToken: RefreshResult }>(
    REFRESH_TOKEN_MUTATION,
    {
      variables: { refreshToken },
      timeout: 10000,
    }
  );

  if (!data?.refreshJwtAuthToken?.authToken) {
    throw new Error('Token refresh failed');
  }

  return data.refreshJwtAuthToken.authToken;
}

/**
 * Register user via GraphQL
 */
export async function graphqlRegisterUser(input: {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}): Promise<RegisterResult> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL is not available');
  }

  const data = await graphqlMutation<{ registerUser: RegisterResult }>(
    REGISTER_USER_MUTATION,
    {
      variables: input,
      timeout: 15000,
    }
  );

  if (!data?.registerUser?.user) {
    throw new Error('Registration failed');
  }

  return data.registerUser;
}

/**
 * Get current viewer (authenticated user) via GraphQL
 */
export async function graphqlGetViewer(
  authToken: string
): Promise<GraphQLUser | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  try {
    const data = await graphqlQuery<{ viewer: GraphQLUser | null }>(
      GET_VIEWER_QUERY,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        timeout: 10000,
      }
    );

    return data?.viewer || null;
  } catch (error) {
    console.error('Failed to get viewer:', error);
    return null;
  }
}

/**
 * Get customer data via GraphQL (WooCommerce customer)
 */
export async function graphqlGetCustomer(
  authToken: string
): Promise<CustomerResult | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  try {
    const data = await graphqlQuery<{ customer: CustomerResult | null }>(
      GET_CUSTOMER_QUERY,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        timeout: 10000,
      }
    );

    return data?.customer || null;
  } catch (error) {
    console.error('Failed to get customer:', error);
    return null;
  }
}

/**
 * Validate auth token by fetching viewer
 */
export async function graphqlValidateToken(authToken: string): Promise<boolean> {
  const viewer = await graphqlGetViewer(authToken);
  return viewer !== null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Normalize GraphQL user to standard user format
 */
export function normalizeGraphQLUser(graphqlUser: GraphQLUser) {
  return {
    id: graphqlUser.databaseId,
    email: graphqlUser.email,
    name: graphqlUser.name || `${graphqlUser.firstName || ''} ${graphqlUser.lastName || ''}`.trim() || graphqlUser.username,
    username: graphqlUser.username,
    firstName: graphqlUser.firstName || '',
    lastName: graphqlUser.lastName || '',
    roles: graphqlUser.roles?.nodes.map(r => r.name) || [],
  };
}

/**
 * Check if GraphQL auth is available
 */
export function isGraphQLAuthAvailable(): boolean {
  return isGraphQLAvailable();
}

