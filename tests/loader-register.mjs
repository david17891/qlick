/**
 * Loader para tests con node --test + TypeScript path aliases (@/*).
 *
 * Se registra vía:
 *   node --import ./tests/loader-register.mjs --test ...
 *
 * Resuelve imports que empiezan con `@/` (definidos en tsconfig.json paths)
 * contra `src/`. Sin este loader, node --test no resuelve los aliases y
 * falla con ERR_MODULE_NOT_FOUND.
 */

import { register } from "node:module";

register(new URL("./loader.mjs", import.meta.url));