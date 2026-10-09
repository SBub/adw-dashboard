// The /hire page's copy, the one place it lives. The owner edits it here; no
// copy for the page belongs anywhere else. Every paragraph below is placeholder
// text, marked "[Placeholder]", until the owner replaces it.

export const OFFERS = ["Product engineer", "AI consulting"] as const;

export type Offer = (typeof OFFERS)[number];

export const HIRE_INTRO: string[] = [
  "[Placeholder] I build products end to end, from the first sketch to the release, and I built ADW, the autonomous development workflow whose runs this dashboard shows.",
  "[Placeholder] I take on product engineering roles and AI consulting work: designing agent pipelines, putting them into a real codebase and making them reliable enough to trust.",
  "[Placeholder] If that sounds like what you need, tell me a little about it below and I will reply by email.",
];

// Placeholder: the owner's LinkedIn profile URL.
export const LINKEDIN_URL = "https://www.linkedin.com/in/REPLACE_ME";
