import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hover?: boolean;
}

export function Card({ className, hover, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white border border-brand-100/70 shadow-card",
        hover && "transition-all duration-300 hover:-translate-y-1 hover:shadow-glow",
        className
      )}
      {...rest}
    />
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...rest} />;
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pb-2", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("p-6 pt-2 flex items-center gap-3", className)}
      {...rest}
    />
  );
}
