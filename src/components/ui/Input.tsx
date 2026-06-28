import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      suppressHydrationWarning
      className={cn(
        "w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink placeholder:text-ink-muted/60",
        "focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition",
        className
      )}
      {...rest}
    />
  );
}

export function Textarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      suppressHydrationWarning
      className={cn(
        "w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink placeholder:text-ink-muted/60",
        "focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition",
        className
      )}
      {...rest}
    />
  );
}

export function Label({
  htmlFor,
  children,
  className
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-sm font-semibold text-ink mb-1.5", className)}
    >
      {children}
    </label>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
