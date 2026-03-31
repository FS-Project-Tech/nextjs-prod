"use client";

import TypesenseInstantSearchAdapter from "typesense-instantsearch-adapter";

let searchClient: any = null;

if (typeof window !== "undefined") {
  const adapter = new TypesenseInstantSearchAdapter({
    server: {
      apiKey: process.env.NEXT_PUBLIC_TYPESENSE_API_KEY!,
      nodes: [
        {
          host: process.env.NEXT_PUBLIC_TYPESENSE_HOST!,
          port: 443,
          protocol: "https",
        },
      ],
    },
    additionalSearchParameters: {
      query_by: "name,sku,category,brand",
    },
  });

  searchClient = adapter.searchClient;
}

export { searchClient };