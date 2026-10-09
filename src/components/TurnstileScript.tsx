"use client";

import Script from "next/script";

// Cloudflare Turnstile's script, with no React wrapper around the widget: the
// page renders a plain `.cf-turnstile` div carrying `data-sitekey`, and this
// leaf renders every such container that has no widget yet. Implicit
// rendering is not enough: it scans the DOM once, when the script loads, and
// next/script loads a given src once per session, so after a soft navigation
// to /hire (the header link, or the action's redirect back with ?error=) the
// widget would never appear and no token would be posted. onReady runs on the
// first load and on every later mount, so the widget renders on each.

type Turnstile = { render: (container: HTMLElement) => string | undefined };

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

function renderWidgets() {
  const turnstile = window.turnstile;
  if (!turnstile) return;
  for (const el of document.querySelectorAll<HTMLElement>(".cf-turnstile")) {
    if (el.childElementCount === 0) turnstile.render(el);
  }
}

export function TurnstileScript() {
  return (
    <Script
      src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      strategy="afterInteractive"
      onReady={renderWidgets}
    />
  );
}
