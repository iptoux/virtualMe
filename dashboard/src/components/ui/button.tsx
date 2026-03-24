import { cn } from "@/lib/utils";

type Variant = "default" | "secondary" | "destructive" | "ghost" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variantCls: Record<Variant, string> = {
  default: "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90",
  secondary: "bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-90",
  destructive: "bg-[var(--destructive)] text-[var(--destructive-foreground)] hover:opacity-90",
  ghost: "hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
  outline: "border border-[var(--border)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]",
};

const sizeCls: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-9 px-4 text-sm",
  lg: "h-10 px-6 text-sm",
  icon: "h-9 w-9",
};

export function Button({
  className,
  variant = "default",
  size = "md",
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50",
        variantCls[variant],
        sizeCls[size],
        className
      )}
      disabled={disabled}
      {...props}
    />
  );
}
