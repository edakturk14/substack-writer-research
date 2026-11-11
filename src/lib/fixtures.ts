import type { Article, SearchResponse } from "./contracts";

// Public destinations and passages checked against the source on 2026-11-11.
// Fixed examples only: never pretend these are query-matched live results.
export const demoArticles: Article[] = [
  {
    url: "https://jamwithai.substack.com/p/ml-and-llm-inference-latency-10-techniques",
    title: "ML and LLM Inference Latency: 10 techniques every AI/ML engineer should know",
    author: "Shirin Khosravi Jam and Shantanu Ladhwe",
    publication: "Jam with AI",
    publishedDate: "2026-05-07",
    excerpt:
      "The model is one component in a longer chain. Network round trips, request serialization, queueing, batching strategy, memory layout on the GPU, the precision of the weights, whether you’re recomputing things you’ve already computed: all of these matter, and most of them are invisible until something breaks.",
  },
  {
    url: "https://jenbaxter.substack.com/p/when-your-reservoir-of-words-runs",
    title: "13 super-smart newsletter ideas for when you’ve got nothing",
    author: "Jen Baxter",
    publication: "The Skillful Scribbler",
    publishedDate: "2025-02-04",
    excerpt:
      "You're constantly leaving breadcrumbs of ideas everywhere: comments on others' posts, emails you've written, and those paragraphs you cut from your last draft. Follow that trail.",
  },
];

export const demoResponse: SearchResponse = { results: demoArticles, mode: "demo" };
export const emptyResponse: SearchResponse = { results: [], mode: "demo" };
