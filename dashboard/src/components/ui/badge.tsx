import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "destructive" | "outline" | "success" | "warning";

const variants: Record<Variant, string> = {
  default: "bg-[var(--primary)] text-[var(--primary-foreground)]",
  secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)]",
  destructive: "bg-[var(--destructive)] text-[var(--destructive-foreground)]",
  outline: "border border-[var(--border)] text-[var(--foreground)]",
  success: "bg-emerald-500/20 text-emerald-400",
  warning: "bg-yellow-500/20 text-yellow-400",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}
