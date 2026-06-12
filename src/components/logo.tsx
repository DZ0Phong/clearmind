import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  withGlow?: boolean;
}

export function Logo({ className, withGlow = true }: Props) {
  // Unique gradient id per render to avoid collisions when multiple Logos
  // appear on the page.
  const gid = "cmLogoBg";
  const glow = "cmLogoGlow";
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-7 w-7", className)}
      aria-label="Clearmind logo"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a5b4fc" />
          <stop offset="0.55" stopColor="#6366f1" />
          <stop offset="1" stopColor="#3730a3" />
        </linearGradient>
        {withGlow && (
          <radialGradient id={glow} cx="0.3" cy="0.3" r="0.7">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0.4" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      <rect width="32" height="32" rx="7" fill={`url(#${gid})`} />
      {withGlow && <rect width="32" height="32" rx="7" fill={`url(#${glow})`} />}
      <path
        d="M16 4 L18.4 13.6 L28 16 L18.4 18.4 L16 28 L13.6 18.4 L4 16 L13.6 13.6 Z"
        fill="white"
      />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Logo className="h-7 w-7 drop-shadow-sm" />
      <div className="flex flex-col leading-none">
        <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
          Clearmind
        </span>
        <span className="text-[10px] text-muted-foreground font-medium mt-0.5">
          Your external brain
        </span>
      </div>
    </div>
  );
}
