import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import SiteHeader from "@/components/site-header";
import workspace from "@/app/page.module.css";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About | Writer Research",
  description: "How Writer Research uses Exa to find Substack posts for specific research questions.",
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
          <p>Writer Research is for finding examples you can use in your own writing. Ask a specific question, scan excerpts from Substack posts, and open the ones worth reading.</p>
        </header>

        <section className={styles.section} aria-labelledby="comparison-title">
          <h2 id="comparison-title">The same question in both searches</h2>
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
              <figcaption><strong>Writer Research</strong><span>The first results included a southern Utah camping report and a drive through Bryce Canyon.</span></figcaption>
              <a href={writerResearchScreenshot} target="_blank" rel="noopener" aria-label="Open the Writer Research screenshot at full size in a new tab">
                <Image src={writerResearchScreenshot} width={768} height={937} unoptimized
                  alt="Writer Research shows a southern Utah camping report and an account of driving through Bryce Canyon, with excerpts from both posts." />
              </a>
            </figure>
          </div>
          <p>In this example, the Exa results gave me better posts to start with. I’d still open them to see which details apply to a late-November trip.</p>
          <Link className={styles.tryLink} href={{ pathname: "/", query: { q: question } }}>Try this question <span aria-hidden="true">→</span></Link>
        </section>

        <section className={styles.section} aria-labelledby="ranking-title">
          <h2 id="ranking-title">How results are ranked</h2>
          <p>Writer Research sends your whole question to Exa, a search engine that matches posts on what they’re about, not only on the words they share with your question. Exa ranks the closest matches first, and that order is the default.</p>
          <p>That is why it works better for specific questions than Substack’s own search. In the example above, Substack’s first results were about spaceflight and rocket launches. Exa’s first results were trip reports from southern Utah, which is what the question asked for.</p>
          <p>We keep only posts on substack.com and its subdomains, show up to 10 per search, and display an excerpt when Exa finds one. Sorting by newest or oldest reorders those same results. Likes, comments, and paid labels come from Substack and help you decide what to open. They don’t change the order.</p>
        </section>
      </main>
    </div>
  );
}
