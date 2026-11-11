import { connection } from "next/server";
import ResearchWorkspace from "@/components/research-workspace";

export default async function Home() {
  await connection();
  return <ResearchWorkspace demoMode={process.env.DEMO_MODE === "1"} />;
}
