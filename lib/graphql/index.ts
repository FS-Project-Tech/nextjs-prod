/**
 * GraphQL Module Exports
 *
 * Centralized exports for all GraphQL-related utilities
 */

// Client
export { graphqlQuery, graphqlMutation, isGraphQLAvailable } from "./client";

// Auth (Client-safe)
export {
  graphqlLogin,
  graphqlRefreshToken,
  graphqlRegisterUser,
  graphqlGetViewer,
  graphqlGetCustomer,
  graphqlValidateToken,
  normalizeGraphQLUser,
  isGraphQLAuthAvailable,
  type GraphQLUser,
  type LoginResult,
  type RefreshResult,
  type RegisterResult,
  type CustomerResult,
} from "./auth";

// Cart (Client-safe)
export {
  graphqlGetCart,
  graphqlAddToCart,
  graphqlUpdateCartItem,
  graphqlRemoveCartItem,
  graphqlClearCart,
  graphqlApplyCoupon,
  graphqlRemoveCoupon,
  isGraphQLCartAvailable,
  type Cart,
  type CartItem,
  type AddToCartResult,
} from "./cart";

// Note: auth-server.ts exports are server-only and should be imported directly where needed.
