import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Primitivos de tabla consistentes para CRM, admin, y dashboards.
 * Estilo coherente con Card (rounded-2xl, hover, border-brand-100).
 *
 * Patrón:
 *   <Table hover striped>
 *     <THead>
 *       <TRow>
 *         <TH>Nombre</TH>
 *         <TH>Email</TH>
 *       </TRow>
 *     </THead>
 *     <TBody>
 *       {leads.map(l => (
 *         <TRow key={l.id}>
 *           <TD>{l.name}</TD>
 *           <TD>{l.email}</TD>
 *         </TRow>
 *       ))}
 *     </TBody>
 *   </Table>
 */
export function Table({
  hover = true,
  striped = false,
  stickyHeader = false,
  className,
  children
}: {
  hover?: boolean;
  striped?: boolean;
  stickyHeader?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-brand-100 bg-white", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">{children}</table>
      </div>
    </div>
  );
}

export function THead({ className, children }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        "border-b border-brand-100 bg-brand-50/40 text-left text-xs font-semibold uppercase tracking-wider text-ink-muted",
        className
      )}
    >
      {children}
    </thead>
  );
}

export function TBody({ className, children }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("divide-y divide-brand-100/60", className)}>{children}</tbody>;
}

export function TRow({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn(
        "transition",
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function TH({ className, children, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={cn("px-4 py-3 font-semibold", className)} {...rest}>
      {children}
    </th>
  );
}

export function TD({ className, children, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn("px-4 py-3 text-ink", className)} {...rest}>
      {children}
    </td>
  );
}
