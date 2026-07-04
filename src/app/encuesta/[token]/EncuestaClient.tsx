"use client";

/**
 * Formulario publico de encuesta post-evento.
 *
 * FIX 2026-07-03 (sesion David G-4). Mobile-first.
 *
 * Estado del form:
 *  - filling: editar respuestas.
 *  - submitting: POST en curso.
 *  - success: gracias, volver al inicio.
 *  - error: reintentar.
 *
 * Campos:
 *  - rating 1-5 (radios)
 *  - "lo que mas te gusto" (textarea)
 *  - "que mejorarias" (textarea, opcional)
 *  - "tema de interes comercial" (textarea, opcional)
 *  - consent (checkbox) — requerido para promover
 *  - email (editable, pre-rellenado del token)
 *  - phone (editable, pre-rellenado del token)
 */

import { useState } from "react";

type FormState = "filling" | "submitting" | "success" | "error";

interface Props {
  token: string;
  prefillEmail: string;
  prefillPhone: string;
}

const RATINGS = [
  { value: 5, label: "Excelente" },
  { value: 4, label: "Muy bueno" },
  { value: 3, label: "Bien" },
  { value: 2, label: "Regular" },
  { value: 1, label: "No me gusto" },
] as const;

export function EncuestaClient({ token, prefillEmail, prefillPhone }: Props) {
  const [state, setState] = useState<FormState>("filling");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const [rating, setRating] = useState<number | null>(null);
  const [liked, setLiked] = useState("");
  const [improve, setImprove] = useState("");
  const [interest, setInterest] = useState("");
  const [consent, setConsent] = useState(false);
  const [email, setEmail] = useState(prefillEmail);
  const [phone, setPhone] = useState(prefillPhone);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) {
      setErrorMsg("Necesitamos tu autorizacion para guardar la encuesta.");
      setState("error");
      return;
    }
    if (rating === null) {
      setErrorMsg("Califica el evento del 1 al 5.");
      setState("error");
      return;
    }
    setState("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/submit-survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          responses: {
            rating,
            liked: liked.trim() || null,
            improve: improve.trim() || null,
          },
          consentToContact: consent,
          commercialInterest: interest.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
      };
      if (!data.ok) {
        setErrorMsg(data.error ?? "No se pudo enviar la encuesta.");
        setState("error");
        return;
      }
      setState("success");
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Error de red. Intenta de nuevo.",
      );
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-2">
        <p className="text-4xl" aria-hidden>
          ✅
        </p>
        <h2 className="text-lg font-bold text-emerald-900">
          Gracias por tu feedback
        </h2>
        <p className="text-sm text-emerald-800">
          Tu opinion nos ayuda a mejorar los proximos eventos.
        </p>
      </div>
    );
  }

  if (state === "submitting") {
    return (
      <div className="rounded-xl bg-violet-50 border border-violet-200 p-5 text-center space-y-2">
        <p className="text-2xl" aria-hidden>
          ⏳
        </p>
        <p className="text-sm font-semibold text-violet-900">
          Enviando tu respuesta...
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl bg-white border border-violet-100 p-4 space-y-4"
    >
      {/* Rating (radios 1-5) */}
      <fieldset>
        <legend className="block text-sm font-bold text-slate-900 mb-2">
          Como calificaras el evento? *
        </legend>
        <div className="grid grid-cols-5 gap-1.5">
          {RATINGS.map((r) => (
            <label
              key={r.value}
              className={`flex flex-col items-center justify-center gap-0.5 cursor-pointer rounded-lg border-2 px-1 py-2.5 text-center transition ${
                rating === r.value
                  ? "border-violet-500 bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="rating"
                value={r.value}
                checked={rating === r.value}
                onChange={() => setRating(r.value)}
                required
                className="sr-only"
              />
              <span className="text-lg font-bold">{r.value}</span>
              <span className="text-[10px] leading-tight">{r.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Lo que mas te gusto */}
      <div>
        <label
          htmlFor="liked"
          className="block text-sm font-bold text-slate-900 mb-1"
        >
          Que fue lo que mas te sirvio?
        </label>
        <textarea
          id="liked"
          value={liked}
          onChange={(e) => setLiked(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Lo que aprendi sobre..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y"
        />
      </div>

      {/* Mejoras */}
      <div>
        <label
          htmlFor="improve"
          className="block text-sm font-bold text-slate-900 mb-1"
        >
          Que mejorarias? <span className="text-ink-muted font-normal">(opcional)</span>
        </label>
        <textarea
          id="improve"
          value={improve}
          onChange={(e) => setImprove(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Mas tiempo para preguntas, mejores ejemplos..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y"
        />
      </div>

      {/* Interes comercial */}
      <div>
        <label
          htmlFor="interest"
          className="block text-sm font-bold text-slate-900 mb-1"
        >
          Te interesa saber mas sobre algo?{" "}
          <span className="text-ink-muted font-normal">(opcional)</span>
        </label>
        <textarea
          id="interest"
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Ej: consultoria 1:1, curso avanzado, asesoria para mi empresa..."
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-y"
        />
      </div>

      {/* Email (editable, pre-rellenado del token) */}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-bold text-slate-900 mb-1"
        >
          Tu correo *
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
        />
      </div>

      {/* Phone */}
      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-bold text-slate-900 mb-1"
        >
          Tu WhatsApp <span className="text-ink-muted font-normal">(opcional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+52 55 1234 5678"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
        />
      </div>

      {/* Consentimiento */}
      <div className="rounded-lg bg-violet-50/60 border border-violet-100 p-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            className="mt-0.5 h-4 w-4 text-violet-600 rounded border-slate-300"
          />
          <span className="text-xs text-slate-700 leading-snug">
            Acepto que Qlick use mi respuesta y datos de contacto para
            enviarme seguimiento comercial sobre los temas que indique.
            Puedo darme de baja en cualquier momento respondiendo STOP al
            WhatsApp o escribiendo a{" "}
            <a
              href="mailto:privacidad@qlick.digital"
              className="underline text-violet-700"
            >
              privacidad@qlick.digital
            </a>
            .
          </span>
        </label>
      </div>

      {/* Error */}
      {state === "error" && errorMsg && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800 font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={state === "filling"}
        className="w-full px-4 py-3 rounded-lg bg-violet-600 text-white font-semibold hover:bg-violet-700 disabled:opacity-50"
      >
        {state === "error" ? "Reintentar" : "Enviar mi feedback"}
      </button>

      <p className="text-[10px] text-ink-muted text-center">
        Tus datos se usan solo para enviarte seguimiento comercial. Ver{" "}
        <a href="/privacidad" className="underline">
          aviso de privacidad
        </a>
        .
      </p>
    </form>
  );
}
