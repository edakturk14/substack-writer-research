export const MAX_QUERY_LENGTH = 300;

export type Article = {
  url: string;
  title: string;
  excerpt?: string;
  author?: string;
  publication?: string;
  publishedDate?: string;
  paid?: true;
};

export type SearchResponse = {
  results: Article[];
  mode: "live" | "demo";
};

export type SearchErrorResponse = {
  error: { code: string; message: string };
};
