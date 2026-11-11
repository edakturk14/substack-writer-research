import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Writer Research",
  description:
    "Follow a question into independent writing. Find Substack articles, read excerpts, and keep a personal reading list.",
  icons: { icon: "/writer-research.svg" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.VERCEL_ENV === "production" ? <Analytics /> : null}
      </body>
    </html>
  );
}
