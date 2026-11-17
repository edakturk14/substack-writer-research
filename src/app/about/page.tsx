import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import workspace from "@/app/page.module.css";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About | Newsletter Research",
  description: "How Newsletter Research uses Nimble and Exa to find Substack posts.",
};

const question = "Find accounts of visiting Zion and Bryce Canyon in late November. What was closed, and what would they skip if they went again?";
const substackScreenshot = "/about/substack-posts.png";
const writerResearchScreenshot = "/about/writer-research-posts.png";

export default function About() {
  return (
    <div className={workspace.page}>
      <SiteHeader current="about" />
      <main id="main" className={workspace.main}>
        <header className={`${workspace.pageHeading} ${styles.heading}`}>
          <h1>Why this search is different</h1>
          <p>Newsletter Research helps you find Substack posts through different search providers. Ask a question, choose Nimble or Exa, and explore the posts each one returns. The same question can lead to different writing.</p>
        </header>

        <section className={styles.section} aria-labelledby="comparison-title">
          <h2 id="comparison-title">An example: Substack search and Exa</h2>
          <blockquote>{question}</blockquote>
          <div className={styles.comparison}>
            <figure>
              <figcaption><strong>Substack · Posts tab</strong><span>The first results covered spaceflight and rocket launches.</span></figcaption>
              <a href={substackScreenshot} target="_blank" rel="noopener" aria-label="Open the Substack screenshot at full size in a new tab">
                <Image src={substackScreenshot} width={1176} height={1508} unoptimized
                  alt="Substack’s Posts tab shows articles about a space station crew, rockets, and satellites for the Zion and Bryce Canyon search." />
              </a>
            </figure>
            <figure>
              <figcaption><strong>Newsletter Research · Exa</strong><span>The first results included a southern Utah camping report and a drive through Bryce Canyon.</span></figcaption>
              <a href={writerResearchScreenshot} target="_blank" rel="noopener" aria-label="Open the Writer Research screenshot at full size in a new tab">
                <Image src={writerResearchScreenshot} width={768} height={937} unoptimized
                  alt="Writer Research shows a southern Utah camping report and an account of driving through Bryce Canyon, with excerpts from both posts." />
              </a>
            </figure>
          </div>
          <p>In this example, the Exa results gave me better posts to start with. I’d still open them to see which details apply to a late-November trip.</p>
          <Link className={styles.tryLink} href={{ pathname: "/", query: { q: question } }}>Try this question <span aria-hidden="true">→</span></Link>
        </section>

        <section className={styles.section} aria-labelledby="nimble-title">
          <h2 id="nimble-title">Trying the same question with Nimble</h2>
          <p>Nimble is another way to search for Substack posts. Select Nimble on the home page and submit your question. We ask its Search API for up to 10 results from substack.com, then show the article links and search snippets it returns.</p>
          <p>Switch to Exa and search again to see what changes. Each provider finds and orders its own results, so you may discover different posts even with the same question. This is a way to explore those differences, without assuming one provider is always better.</p>
          <p>The screenshots above show the earlier Exa search alongside Substack’s own search. They are kept as an example, not as Nimble results or a live comparison. New searches may return different posts.</p>
          <p><a href="https://www.nimbleway.com" target="_blank" rel="noopener noreferrer">Learn about Nimble</a> · <Link href="/">Try Search Lab</Link></p>
        </section>

        <section className={styles.section} aria-labelledby="ranking-title">
          <h2 id="ranking-title">How results are ranked</h2>
          <p>Search Lab sends your whole question to the provider you select: Nimble or Exa. We keep the provider’s result order, remove duplicates, and include only valid Substack article links.</p>
          <p>The comparison above was made with Exa. In that search, Substack’s first results were about spaceflight and rocket launches. Exa’s first results were trip reports from southern Utah, which is what the question asked for.</p>
          <p>We keep only posts on substack.com and its subdomains, show up to 10 per search, and display search snippets from Nimble or highlights from Exa when available. Sorting by newest or oldest reorders those same results. Likes, comments, and paid labels come from Substack and help you decide what to open. They don’t change the order.</p>
        </section>
      </main>
    </div>
  );
}
