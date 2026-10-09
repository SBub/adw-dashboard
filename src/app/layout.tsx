import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrandLink, SectionNav } from "@/components/SectionNav";
import { HEADER_LAYER } from "@/lib/layers";

import "./globals.css";

export const metadata: Metadata = {
  title: "ADW Dashboard",
  description: "Runs of the AI Developer Workflow toolkit across projects.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header
          className={`sticky top-0 ${HEADER_LAYER} border-b border-neutral-200 bg-background dark:border-neutral-800`}
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex items-center gap-3 sm:gap-6">
              <BrandLink />
              <SectionNav />
            </div>
            <div className="ml-auto flex items-center gap-3">
              <span className="hidden text-xs text-neutral-500 sm:inline dark:text-neutral-400">
                AI Developer Workflow runs
              </span>
            </div>
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
