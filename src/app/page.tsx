import { connection } from "next/server";
import ResearchWorkspace from "@/components/research-workspace";
import { MAX_QUERY_LENGTH } from "@/lib/contracts";

export default async function Home({ searchParams }: PageProps<"/">) {
  await connection();
  const { q } = await searchParams;
  const initialQuery = typeof q === "string" ? q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  return (
    <ResearchWorkspace
      key={initialQuery}
      demoMode={process.env.DEMO_MODE === "1"}
      initialQuery={initialQuery}
    />
  );
}
