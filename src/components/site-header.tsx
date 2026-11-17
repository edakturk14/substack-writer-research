import Link from "next/link";
import styles from "@/app/page.module.css";

export default function SiteHeader({ current }: { current: "about" | "lab" }) {
  return (
    <>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <nav className={styles.navigation} aria-label="Main navigation">
          <Link href="/" aria-current={current === "lab" ? "page" : undefined}>Search Lab</Link>
          <Link href="/about" aria-current={current === "about" ? "page" : undefined}>About</Link>
        </nav>
      </header>
    </>
  );
}
