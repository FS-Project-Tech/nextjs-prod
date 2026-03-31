/**
 * WooGraphQL Cart Operations
 * 
 * GraphQL-based cart management with session support
 * Requires: WPGraphQL + WooGraphQL plugins
 */

import { graphqlQuery, graphqlMutation, isGraphQLAvailable } from './client';

// ============================================================================
// Types
// ============================================================================

export interface CartItem {
  key: string;
  quantity: number;
  total: string;
  subtotal: string;
  product: {
    node: {
      id: string;
      databaseId: number;
      name: string;
      slug: string;
      sku: string | null;
      price: string | null;
      image: {
        sourceUrl: string | null;
        altText: string | null;
      } | null;
    };
  };
  variation?: {
    node: {
      id: string;
      databaseId: number;
      name: string;
      sku: string | null;
      price: string | null;
    };
  } | null;
}

export interface Cart {
  contents: {
    nodes: CartItem[];
    itemCount: number;
  };
  subtotal: string;
  total: string;
  shippingTotal: string | null;
  discountTotal: string | null;
  appliedCoupons: {
    nodes: {
      code: string;
      discountAmount: string;
    }[];
  } | null;
}

export interface AddToCartResult {
  cart: Cart;
  cartItem: CartItem;
}

// ============================================================================
// GraphQL Queries & Mutations
// ============================================================================

const GET_CART_QUERY = `
  query GetCart {
    cart {
      contents {
        nodes {
          key
          quantity
          total
          subtotal
          product {
            node {
              id
              databaseId
              name
              slug
              sku
              price
              image {
                sourceUrl
                altText
              }
            }
          }
          variation {
            node {
              id
              databaseId
              name
              sku
              price
            }
          }
        }
        itemCount
      }
      subtotal
      total
      shippingTotal
      discountTotal
      appliedCoupons {
        nodes {
          code
          discountAmount
        }
      }
    }
  }
`;

const ADD_TO_CART_MUTATION = `
  mutation AddToCart($productId: Int!, $quantity: Int = 1, $variationId: Int) {
    addToCart(
      input: { productId: $productId, quantity: $quantity, variationId: $variationId }
    ) {
      cart {
        contents {
          nodes {
            key
            quantity
            total
            subtotal
            product {
              node {
                id
                databaseId
                name
                slug
                sku
                price
                image {
                  sourceUrl
                  altText
                }
              }
            }
          }
          itemCount
        }
        subtotal
        total
      }
      cartItem {
        key
        quantity
        total
        subtotal
        product {
          node {
            id
            databaseId
            name
            slug
            sku
            price
            image {
              sourceUrl
              altText
            }
          }
        }
      }
    }
  }
`;

const UPDATE_CART_ITEM_MUTATION = `
  mutation UpdateCartItem($key: ID!, $quantity: Int!) {
    updateItemQuantities(input: { items: [{ key: $key, quantity: $quantity }] }) {
      cart {
        contents {
          nodes {
            key
            quantity
            total
            subtotal
            product {
              node {
                id
                databaseId
                name
                slug
                sku
                price
                image {
                  sourceUrl
                  altText
                }
              }
            }
          }
          itemCount
        }
        subtotal
        total
      }
    }
  }
`;

const REMOVE_CART_ITEM_MUTATION = `
  mutation RemoveCartItem($key: ID!) {
    removeItemsFromCart(input: { keys: [$key] }) {
      cart {
        contents {
          nodes {
            key
            quantity
            total
            subtotal
            product {
              node {
                id
                databaseId
                name
                slug
                sku
                price
                image {
                  sourceUrl
                  altText
                }
              }
            }
          }
          itemCount
        }
        subtotal
        total
      }
    }
  }
`;

const CLEAR_CART_MUTATION = `
  mutation ClearCart {
    removeItemsFromCart(input: { all: true }) {
      cart {
        contents {
          nodes {
            key
          }
          itemCount
        }
        subtotal
        total
      }
    }
  }
`;

const APPLY_COUPON_MUTATION = `
  mutation ApplyCoupon($code: String!) {
    applyCoupon(input: { code: $code }) {
      cart {
        contents {
          itemCount
        }
        subtotal
        total
        discountTotal
        appliedCoupons {
          nodes {
            code
            discountAmount
          }
        }
      }
    }
  }
`;

const REMOVE_COUPON_MUTATION = `
  mutation RemoveCoupon($code: String!) {
    removeCoupons(input: { codes: [$code] }) {
      cart {
        contents {
          itemCount
        }
        subtotal
        total
        discountTotal
        appliedCoupons {
          nodes {
            code
            discountAmount
          }
        }
      }
    }
  }
`;

// ============================================================================
// Cart Functions
// ============================================================================

/**
 * Get cart via GraphQL
 */
export async function graphqlGetCart(
  sessionToken?: string
): Promise<Cart | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const data = await graphqlQuery<{ cart: Cart | null }>(GET_CART_QUERY, {
      headers,
      timeout: 15000,
    });

    return data?.cart || null;
  } catch (error) {
    console.error('Failed to get cart:', error);
    return null;
  }
}

/**
 * Add item to cart via GraphQL
 */
export async function graphqlAddToCart(
  productId: number,
  quantity: number = 1,
  variationId?: number,
  sessionToken?: string
): Promise<AddToCartResult | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const data = await graphqlMutation<{ addToCart: AddToCartResult }>(
      ADD_TO_CART_MUTATION,
      {
        variables: { productId, quantity, variationId },
        headers,
        timeout: 15000,
      }
    );

    return data?.addToCart || null;
  } catch (error) {
    console.error('Failed to add to cart:', error);
    return null;
  }
}

/**
 * Update cart item quantity via GraphQL
 */
export async function graphqlUpdateCartItem(
  key: string,
  quantity: number,
  sessionToken?: string
): Promise<Cart | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const data = await graphqlMutation<{ updateItemQuantities: { cart: Cart } }>(
      UPDATE_CART_ITEM_MUTATION,
      {
        variables: { key, quantity },
        headers,
        timeout: 15000,
      }
    );

    return data?.updateItemQuantities?.cart || null;
  } catch (error) {
    console.error('Failed to update cart item:', error);
    return null;
  }
}

/**
 * Remove item from cart via GraphQL
 */
export async function graphqlRemoveCartItem(
  key: string,
  sessionToken?: string
): Promise<Cart | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const data = await graphqlMutation<{ removeItemsFromCart: { cart: Cart } }>(
      REMOVE_CART_ITEM_MUTATION,
      {
        variables: { key },
        headers,
        timeout: 15000,
      }
    );

    return data?.removeItemsFromCart?.cart || null;
  } catch (error) {
    console.error('Failed to remove cart item:', error);
    return null;
  }
}

/**
 * Clear cart via GraphQL
 */
export async function graphqlClearCart(
  sessionToken?: string
): Promise<Cart | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const data = await graphqlMutation<{ removeItemsFromCart: { cart: Cart } }>(
      CLEAR_CART_MUTATION,
      {
        headers,
        timeout: 15000,
      }
    );

    return data?.removeItemsFromCart?.cart || null;
  } catch (error) {
    console.error('Failed to clear cart:', error);
    return null;
  }
}

/**
 * Apply coupon via GraphQL
 */
export async function graphqlApplyCoupon(
  code: string,
  sessionToken?: string
): Promise<Cart | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const data = await graphqlMutation<{ applyCoupon: { cart: Cart } }>(
      APPLY_COUPON_MUTATION,
      {
        variables: { code },
        headers,
        timeout: 15000,
      }
    );

    return data?.applyCoupon?.cart || null;
  } catch (error) {
    console.error('Failed to apply coupon:', error);
    return null;
  }
}

/**
 * Remove coupon via GraphQL
 */
export async function graphqlRemoveCoupon(
  code: string,
  sessionToken?: string
): Promise<Cart | null> {
  if (!isGraphQLAvailable()) {
    return null;
  }

  const headers: Record<string, string> = {};
  if (sessionToken) {
    headers['woocommerce-session'] = `Session ${sessionToken}`;
  }

  try {
    const data = await graphqlMutation<{ removeCoupons: { cart: Cart } }>(
      REMOVE_COUPON_MUTATION,
      {
        variables: { code },
        headers,
        timeout: 15000,
      }
    );

    return data?.removeCoupons?.cart || null;
  } catch (error) {
    console.error('Failed to remove coupon:', error);
    return null;
  }
}

/**
 * Check if GraphQL cart is available
 */
export function isGraphQLCartAvailable(): boolean {
  return isGraphQLAvailable();
}

