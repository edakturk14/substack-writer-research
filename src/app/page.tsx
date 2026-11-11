import { connection } from "next/server";
import ResearchWorkspace from "@/components/research-workspace";
import { MAX_QUERY_LENGTH } from "@/lib/contracts";

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const { q, view } = await searchParams;
  const initialQuery = typeof q === "string" ? q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  const initialView = view === "saved" ? "saved" : "search";
  return (
    <ResearchWorkspace
      key={`${initialView}:${initialQuery}`}
      demoMode={process.env.DEMO_MODE === "1"}
      initialQuery={initialQuery}
      initialView={initialView}
    />
  );
}
