import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ConnectionIndicator } from "@/components/ConnectionIndicator";
import { SectionNav } from "@/components/SectionNav";

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
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex items-center gap-3 sm:gap-6">
              <Link href="/" className="font-semibold tracking-tight">
                ADW Dashboard
              </Link>
              <SectionNav />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs text-neutral-500 sm:inline dark:text-neutral-400">
                AI Developer Workflow runs
              </span>
              <ConnectionIndicator />
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
