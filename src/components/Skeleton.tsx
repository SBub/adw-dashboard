/**
 * One placeholder block of a loading skeleton: a muted surface, hidden from
 * assistive tech (the skeleton's container announces the loading state). Its
 * size and spacing come from the caller's `className`; `round` makes it a pill
 * or a circle (a separate prop, because two radius classes in one list would
 * leave the winner to the stylesheet's order). The pulse is `motion-safe:`
 * only, so a user who asked for reduced motion gets static blocks. A span, so
 * it is valid inside any inline or flex parent. A server component with no
 * state.
 */
export function Skeleton({
  className = "",
  round = false,
}: {
  className?: string;
  round?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={`block ${round ? "rounded-full" : "rounded-md"} bg-neutral-200 motion-safe:animate-pulse dark:bg-neutral-800 ${className}`}
    />
  );
}
