import { cn } from "@/lib/utils";

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const sizes = {
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-12 w-12 text-sm",
    xl: "h-16 w-16 text-lg",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-accent font-semibold text-accent-fg shadow-sm",
        sizes[size],
        className
      )}
      aria-hidden
    >
      {initials}
    </div>
  );
}
