import type { ReactNode } from "react";
import Link from "next/link";
import styles from "@/app/page.module.css";

export default function SiteHeader({ children, about = false, onHome }: {
  children?: ReactNode;
  about?: boolean;
  onHome?: () => void;
}) {
  return (
    <>
      <a className={styles.skipLink} href="#main">Skip to content</a>
      <header className={styles.header}>
        <Link className={styles.brandName} href="/" onNavigate={onHome}>Writer Research</Link>
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
