import {
  cloneElement,
  isValidElement,
  useId,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes
} from "react";
import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Marca el input como inválido (borde rojo + aria-invalid). */
  invalid?: boolean;
  /** ID del mensaje de error (para aria-describedby). */
  errorId?: string;
};

export function Input({ className, invalid, errorId, ...rest }: InputProps) {
  return (
    <input
      suppressHydrationWarning
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      className={cn(
        "w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink placeholder:text-ink-muted/60",
        "focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition",
        invalid &&
          "border-red-400 focus:border-red-500 focus:ring-red-100 bg-red-50/30",
        className
      )}
      {...rest}
    />
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
  errorId?: string;
};

export function Textarea({
  className,
  invalid,
  errorId,
  ...rest
}: TextareaProps) {
  return (
    <textarea
      suppressHydrationWarning
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      className={cn(
        "w-full rounded-xl border border-brand-100 bg-white px-4 py-3 text-ink placeholder:text-ink-muted/60",
        "focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition",
        invalid &&
          "border-red-400 focus:border-red-500 focus:ring-red-100 bg-red-50/30",
        className
      )}
      {...rest}
    />
  );
}

export function Label({
  htmlFor,
  children,
  className,
  required
}: {
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  /** Marca el label con asterisco rojo + sr-only "(obligatorio)". */
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("block text-sm font-semibold text-ink mb-1.5", className)}
    >
      {required && (
        <span aria-hidden="true" className="text-red-600 mr-0.5">
          *
        </span>
      )}
      {children}
      {required && <span className="sr-only"> (obligatorio)</span>}
    </label>
  );
}

/**
 * Field = Label + child (típicamente Input/Textarea) + hint + error inline.
 *
 * Patrón recomendado para forms del admin. Si pasás `error`, el Field:
 * 1. Marca el child (Input/Textarea) con `aria-invalid={true}` y
 *    `aria-describedby={errorId}` automáticamente (via cloneElement si
 *    el child es uno de nuestros componentes; en otros casos el caller
 *    debe pasar `id` y `aria-*` manualmente).
 * 2. Pinta borde rojo en el child (Input/Textarea) con `invalid={true}`.
 * 3. Renderiza el mensaje en `<p role="alert" id="errorId">` para que
 *    screen readers lo anuncien.
 *
 * Si NO pasás `htmlFor`, se genera uno con `useId()` y se inyecta en
 * el child automáticamente. Si pasás `htmlFor`, el caller es responsable
 * de poner `id={htmlFor}` en el child (caso multi-child o custom).
 *
 * Ejemplo mínimo:
 * ```tsx
 * <Field label="Email" error={errors.email} required>
 *   <Input type="email" value={...} onChange={...} />
 * </Field>
 * ```
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  children
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  /** Mensaje de error inline. Si está presente, marca el input como inválido
   *  y muestra el mensaje en rojo con `role="alert"`. */
  error?: string | null;
  /** Marca el label con asterisco rojo (campo obligatorio). */
  required?: boolean;
  children: ReactNode;
}) {
  const autoId = useId();
  const id = htmlFor ?? autoId;
  const errorId = `${id}-error`;

  // Si el caller pasó htmlFor, no tocamos el child (responsabilidad del caller).
  // Si NO pasó htmlFor, inyectamos id + a11y en el child si es Input/Textarea.
  let enhanced = children;
  if (!htmlFor && isValidElement(children)) {
    const el = children as ReactElement<{
      id?: string;
      "aria-invalid"?: boolean;
      "aria-describedby"?: string;
      invalid?: boolean;
      errorId?: string;
    }>;
    const typeMatches = el.type === Input || el.type === Textarea;
    if (typeMatches) {
      enhanced = cloneElement(el, {
        id,
        invalid: !!error,
        errorId: error ? errorId : undefined,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error ? errorId : undefined,
      });
    }
  }

  return (
    <div>
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {enhanced}
      {hint && !error && (
        <p className="mt-1 text-xs text-ink-muted">{hint}</p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 text-xs text-red-700 font-medium"
        >
          {error}
        </p>
      )}
    </div>
  );
}
