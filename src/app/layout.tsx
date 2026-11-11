import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Substack Writer Research",
  description:
    "Follow a question into independent writing. Find Substack articles, read excerpts, and keep a personal reading list.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
