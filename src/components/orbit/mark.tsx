import { cn } from "@/lib/cn";

export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("size-6", className)}
      aria-hidden="true"
    >
      <circle cx="16" cy="16.4" r="9.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="22.2" cy="10.2" r="2.5" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <Mark />
      <span className="text-base font-medium tracking-tight">Orbit Meeting</span>
    </span>
  );
}
