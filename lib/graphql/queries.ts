/**
 * Common GraphQL Queries for WooCommerce
 * 
 * These queries use WPGraphQL + WooGraphQL schema
 */

import { graphqlQuery, isGraphQLAvailable } from './client';

/**
 * Product fields fragment
 */
export const PRODUCT_FIELDS = `
  id
  databaseId
  name
  slug
  sku
  price
  regularPrice
  salePrice
  onSale
  stockStatus
  stockQuantity
  manageStock
  description
  shortDescription
  image {
    sourceUrl
    altText
  }
  galleryImages {
    nodes {
      sourceUrl
      altText
    }
  }
  categories {
    nodes {
      id
      name
      slug
    }
  }
  attributes {
    nodes {
      id
      name
      options
    }
  }
`;

/**
 * Fetch products with filters (GraphQL)
 */
export async function getProductsGraphQL(params: {
  first?: number;
  after?: string;
  category?: string;
  search?: string;
  orderBy?: string;
  order?: 'ASC' | 'DESC';
}): Promise<any> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL not available');
  }

  const { first = 24, after, category, search, orderBy = 'DATE', order = 'DESC' } = params;

  const query = `
    query GetProducts($first: Int, $after: String, $category: String, $search: String, $orderBy: ProductsOrderbyEnum, $order: OrderEnum) {
      products(
        first: $first
        after: $after
        where: {
          ${category ? `category: $category` : ''}
          ${search ? `search: $search` : ''}
          orderby: { field: $orderBy, order: $order }
        }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${PRODUCT_FIELDS}
        }
      }
    }
  `;

  return graphqlQuery(query, {
    variables: {
      first,
      after,
      category,
      search,
      orderBy,
      order,
    },
  });
}

/**
 * Fetch single product by slug (GraphQL)
 */
export async function getProductBySlugGraphQL(slug: string): Promise<any> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL not available');
  }

  const query = `
    query GetProduct($slug: ID!) {
      product(id: $slug, idType: SLUG) {
        ${PRODUCT_FIELDS}
        variations {
          nodes {
            id
            name
            price
            stockStatus
            attributes {
              nodes {
                name
                value
              }
            }
          }
        }
      }
    }
  `;

  return graphqlQuery(query, {
    variables: { slug },
  });
}

/**
 * Fetch categories with product counts (GraphQL)
 */
export async function getCategoriesGraphQL(params: {
  first?: number;
  parent?: number;
}): Promise<any> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL not available');
  }

  const { first = 100, parent } = params;

  const query = `
    query GetCategories($first: Int, $parent: Int) {
      productCategories(
        first: $first
        where: { ${parent ? `parent: $parent` : ''} }
      ) {
        nodes {
          id
          databaseId
          name
          slug
          description
          count
          image {
            sourceUrl
            altText
          }
          parent {
            node {
              id
              name
              slug
            }
          }
        }
      }
    }
  `;

  return graphqlQuery(query, {
    variables: { first, parent },
  });
}

/**
 * Fetch products by category with pagination (GraphQL)
 */
export async function getProductsByCategoryGraphQL(
  categorySlug: string,
  params: {
    first?: number;
    after?: string;
  } = {}
): Promise<any> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL not available');
  }

  const { first = 24, after } = params;

  const query = `
    query GetProductsByCategory($categorySlug: String!, $first: Int, $after: String) {
      products(
        first: $first
        after: $after
        where: {
          category: $categorySlug
        }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${PRODUCT_FIELDS}
        }
      }
    }
  `;

  return graphqlQuery(query, {
    variables: {
      categorySlug,
      first,
      after,
    },
  });
}

/**
 * Search products (GraphQL)
 */
export async function searchProductsGraphQL(
  searchTerm: string,
  params: {
    first?: number;
    after?: string;
  } = {}
): Promise<any> {
  if (!isGraphQLAvailable()) {
    throw new Error('GraphQL not available');
  }

  const { first = 24, after } = params;

  const query = `
    query SearchProducts($search: String!, $first: Int, $after: String) {
      products(
        first: $first
        after: $after
        where: {
          search: $search
        }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${PRODUCT_FIELDS}
        }
      }
    }
  `;

  return graphqlQuery(query, {
    variables: {
      search: searchTerm,
      first,
      after,
    },
  });
}

