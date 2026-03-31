import { algoliasearch } from "algoliasearch";

export const getSearchClient = () => {
  if (
    !process.env.NEXT_PUBLIC_ALGOLIA_APP_ID ||
    !process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY
  ) {
    throw new Error("Algolia env variables are missing");
  }

  return algoliasearch(
    process.env.NEXT_PUBLIC_ALGOLIA_APP_ID,
    process.env.NEXT_PUBLIC_ALGOLIA_SEARCH_KEY
  );
};