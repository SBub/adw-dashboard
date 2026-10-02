import Link from "next/link";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  repoUrl?: string | null;
  back?: { href: string; label: string };
}

export function PageHeader({ title, subtitle, repoUrl, back }: PageHeaderProps) {
  return (
    <div className="mb-8">
      {back && (
        <Link
          href={back.href}
          className="text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          &larr; {back.label}
        </Link>
      )}
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="mt-1 font-mono text-sm text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </p>
          )}
        </div>
        {repoUrl && (
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-sm underline underline-offset-4 hover:text-neutral-600 dark:hover:text-neutral-300"
          >
            Repository &nearr;
          </a>
        )}
      </div>
    </div>
  );
}
