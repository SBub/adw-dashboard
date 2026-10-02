import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
        There is no project at this address.
      </p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">
        &larr; All projects
      </Link>
    </div>
  );
}
