"use client";

import { useFormStatus } from "react-dom";
import { HIRE_ACCENT } from "@/lib/accent";

// The hire form's Send button. A client leaf only to read the enclosing form's
// pending state: disabled and relabelled while the action runs.
export function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={`rounded-md px-4 py-2 text-sm font-medium ${HIRE_ACCENT} disabled:opacity-70`}
    >
      {pending ? "Sending..." : "Send"}
    </button>
  );
}
