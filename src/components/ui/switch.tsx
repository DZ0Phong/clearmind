import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  disabled?: boolean;
  /** Optional aria-label (use when there's no nearby `<label>` element). */
  "aria-label"?: string;
  /** Optional data-testid for Playwright. */
  "data-testid"?: string;
}

/**
 * Lightweight ON/OFF switch — purposely NOT a button with text labels.
 *
 * The autostart card previously used a Button whose label flipped between
 * "Enable" and "On" depending on state. Users (rightly) read "Enable" as
 * an action and "On" as a state, didn't realize they could click "On" to
 * turn it off, and reported it as a bug. A native-looking switch puts the
 * current state on the LEFT (off-track) or RIGHT (on-track) so the user
 * sees both the state and the affordance to flip at a glance.
 *
 * Implementation: a single `<button role="switch">` with two
 * tailwind-styled spans — the track + the thumb. No Radix dependency,
 * no portal, no animation library; just a `translate-x` transition.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  ...rest
}: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest["aria-label"]}
      data-testid={rest["data-testid"]}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onCheckedChange(!checked);
      }}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center",
        "rounded-full border-2 border-transparent transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted-foreground/30"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-background shadow-md",
          "transition-transform duration-150 ease-out",
          checked ? "translate-x-5" : "translate-x-0"
        )}
      />
    </button>
  );
}
