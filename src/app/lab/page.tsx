import { connection } from "next/server";
import type { Metadata } from "next";
import ResearchWorkspace from "@/components/research-workspace";
import { MAX_QUERY_LENGTH } from "@/lib/contracts";

export const metadata: Metadata = {
  title: "Search Lab | Newsletter Research",
  description: "Explore Substack search results with Nimble and Exa.",
};

export default async function SearchLab({ searchParams }: PageProps<"/lab">) {
  await connection();
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  return <ResearchWorkspace key={initialQuery} laboratory demoMode={process.env.DEMO_MODE === "1"} initialQuery={initialQuery} />;
}
