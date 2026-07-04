/**
 * Helper puro sin imports: compara timestamps ISO.
 *
 * Separado de `survey-tokens.ts` para poder testearlo con `node --test`
 * sin que el loader de node chupe con path aliases de TypeScript.
 *
 * @server
 */

export function isSurveyTokenExpired(
  expiresAtIso: string,
  nowMs: number = Date.now(),
): boolean {
  return new Date(expiresAtIso).getTime() < nowMs;
}
