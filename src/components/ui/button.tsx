import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg" | "icon";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-[transform,background-color,opacity,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        size === "md" && "h-11 rounded-md px-4 text-sm",
        size === "lg" && "h-12 rounded-md px-5 text-base",
        size === "icon" && "size-11 shrink-0 rounded-full",
        variant === "primary" && "bg-accent text-ink hover:opacity-90",
        variant === "secondary" && "border border-strong bg-subtle text-fg hover:bg-elevated",
        variant === "ghost" && "bg-transparent text-fg hover:bg-subtle",
        variant === "danger" && "bg-danger text-danger-fg hover:opacity-90",
        className,
      )}
      {...props}
    />
  );
}
