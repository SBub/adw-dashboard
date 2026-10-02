import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "ADW Dashboard",
  description: "Runs of the AI Developer Workflow toolkit across projects.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-semibold tracking-tight">
              ADW Dashboard
            </Link>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              AI Developer Workflow runs
            </span>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
