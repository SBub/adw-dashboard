interface PageHeaderProps {
  title: string;
  subtitle?: string;
  repoUrl?: string | null;
}

export function PageHeader({ title, subtitle, repoUrl }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {subtitle && (
        <p className="mt-1 font-mono text-sm text-neutral-500 dark:text-neutral-400">
          {repoUrl ? (
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:text-neutral-700 hover:underline dark:hover:text-neutral-200"
            >
              {subtitle}
              <ExternalLinkIcon />
            </a>
          ) : (
            subtitle
          )}
        </p>
      )}
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M9 2.5h4.5V7" />
      <path d="M13.5 2.5 7 9" />
      <path d="M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3" />
    </svg>
  );
}
