import { redirect } from "next/navigation";
import { MAX_QUERY_LENGTH } from "@/lib/contracts";

export default async function LegacyLab({ searchParams }: PageProps<"/lab">) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, MAX_QUERY_LENGTH) : "";
  redirect(query ? `/?${new URLSearchParams({ q: query })}` : "/");
}
