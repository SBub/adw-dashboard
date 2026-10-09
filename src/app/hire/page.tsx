import type { Metadata } from "next";
import { SectionBoundary } from "@/components/SectionBoundary";
import { SubmitButton } from "@/components/SubmitButton";
import { TurnstileScript } from "@/components/TurnstileScript";
import { HIRE_INTRO, LINKEDIN_URL, OFFERS } from "@/content/hire";
import {
  EMAIL_MAX,
  HIRE_ERROR_MESSAGES,
  hireStatus,
  MOTIVATION_MAX,
  MOTIVATION_MIN,
  NAME_MAX,
} from "@/lib/hire-request";
import { sendHireRequest } from "../actions/send-hire-request";

export const metadata: Metadata = {
  title: "Hire me",
  description: "Hire the author of ADW for product engineering or AI consulting.",
};

type SearchParams = Promise<{ sent?: string | string[]; error?: string | string[] }>;

const LABEL = "block text-sm font-medium";
const FIELD =
  "mt-1 block w-full rounded-md border border-neutral-300 bg-background px-3 py-2 text-sm dark:border-neutral-700";

// The form. It posts to the server action, which redirects back here with
// ?sent=1 or ?error=<code>; the browser's own validation mirrors the server's
// bounds, which are the ones that count.
function HireForm() {
  return (
    <form action={sendHireRequest} className="mt-4 max-w-xl space-y-4">
      <div>
        <label htmlFor="hire-offer" className={LABEL}>
          What are you hiring for?
        </label>
        <select id="hire-offer" name="offer" required className={FIELD}>
          {OFFERS.map((offer) => (
            <option key={offer} value={offer}>
              {offer}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="hire-email" className={LABEL}>
          Your email
        </label>
        <input
          id="hire-email"
          type="email"
          name="email"
          required
          maxLength={EMAIL_MAX}
          autoComplete="email"
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="hire-name" className={LABEL}>
          Your name <span className="font-normal text-neutral-500">(optional)</span>
        </label>
        <input
          id="hire-name"
          name="name"
          maxLength={NAME_MAX}
          autoComplete="name"
          className={FIELD}
        />
      </div>
      <div>
        <label htmlFor="hire-motivation" className={LABEL}>
          What would you like to work on?
        </label>
        <textarea
          id="hire-motivation"
          name="motivation"
          required
          minLength={MOTIVATION_MIN}
          maxLength={MOTIVATION_MAX}
          rows={6}
          className={FIELD}
        />
      </div>
      <div
        className="cf-turnstile"
        data-sitekey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
      />
      <TurnstileScript />
      <SubmitButton />
    </form>
  );
}

// The request-time island: awaiting searchParams makes it the hole under its
// SectionBoundary. A sent request replaces the form; an error sits above it.
async function HireStatus({ searchParams }: { searchParams: SearchParams }) {
  const status = hireStatus(await searchParams);

  if (status?.kind === "sent") {
    return (
      <p role="status" className="mt-6 max-w-[70ch] text-base">
        Thanks, your message was sent. I will reply to the email you gave.
      </p>
    );
  }

  return (
    <div className="mt-6">
      {status?.kind === "error" && (
        <p role="alert" className="text-sm font-medium text-fuchsia-700 dark:text-fuchsia-400">
          {HIRE_ERROR_MESSAGES[status.code]}
        </p>
      )}
      <HireForm />
    </div>
  );
}

// Not async: the heading, the intro and the LinkedIn link are the static
// shell, the status and the form are the hole. Outside (dashboard), like "/":
// no Providers, no Realtime, no sidebar.
export default function HirePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-semibold tracking-tight">Hire me</h1>
      <div className="mt-2 max-w-[70ch] space-y-2 text-base text-neutral-700 dark:text-neutral-300">
        {HIRE_INTRO.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <p className="mt-3 text-sm">
        <a
          href={LINKEDIN_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          LinkedIn profile
        </a>
      </p>
      <SectionBoundary
        fallback={
          <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">Loading form...</p>
        }
        detail="The form did not load."
      >
        <HireStatus searchParams={searchParams} />
      </SectionBoundary>
    </div>
  );
}
