import type { ReactNode } from "react";
import Link from "next/link";
import styles from "@/app/page.module.css";

export default function SiteHeader({ children, about = false }: {
  children?: ReactNode;
  about?: boolean;
}) {
  return (
    <>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <nav className={styles.navigation} aria-label="Main navigation">
          {children ?? (
            <>
              <Link href="/">Search</Link>
              <Link href="/?view=saved">Saved</Link>
            </>
          )}
          <Link href="/about" aria-current={about ? "page" : undefined}>About</Link>
        </nav>
      </header>
    </>
  );
}
