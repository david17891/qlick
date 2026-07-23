/**
 * ESM loader hook que resuelve `@/...` path aliases definidos en tsconfig.json.
 *
 * Usado por los tests para poder importar módulos de `src/` que a su vez
 * importan otros módulos con `@/lib/...` (lo cual es la convención del
 * proyecto). Sin esto, node --test no resuelve los aliases.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodePath from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

// Localizar tsconfig.json (subimos hasta encontrarlo).
function findTsConfig(startDir) {
  let dir = startDir;
  while (true) {
    const candidate = nodePath.join(dir, "tsconfig.json");
    if (existsSync(candidate)) return candidate;
    const parent = nodePath.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const tsConfigPath = findTsConfig(__dirname);
if (!tsConfigPath) {
  throw new Error("loader.mjs: no se encontró tsconfig.json.");
}

const tsConfig = JSON.parse(readFileSync(tsConfigPath, "utf8"));
const baseUrl = nodePath.resolve(nodePath.dirname(tsConfigPath), tsConfig.compilerOptions?.baseUrl ?? ".");
const paths = tsConfig.compilerOptions?.paths ?? {};

/** Convierte `@/foo/bar` → `src/foo/bar` (absoluto). */
function resolveAlias(specifier) {
  for (const [pattern, replacements] of Object.entries(paths)) {
    if (pattern.endsWith("/*")) {
      const prefix = pattern.slice(0, -2);
      const wildcard = specifier.startsWith(prefix + "/");
      if (wildcard) {
        const rest = specifier.slice(prefix.length + 1);
        for (const repl of replacements) {
          if (repl.endsWith("/*")) {
            const targetBase = nodePath.join(baseUrl, repl.slice(0, -2));
            const target = nodePath.join(targetBase, rest);
            if (existsSync(target + ".ts")) return target + ".ts";
            if (existsSync(target + ".tsx")) return target + ".tsx";
            if (existsSync(target + "/index.ts")) return target + "/index.ts";
            return target;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Resuelve imports relativos sin extensión (./foo, ../bar) probando
 * `.ts`, `.tsx`, `/index.ts`, `/index.tsx`, `.mjs`, `.js`. Sin esto,
 * los archivos de src/ que importan relativos sin extensión (convención
 * del proyecto) rompen node --test con ERR_UNKNOWN_FILE_EXTENSION.
 */
function resolveRelativeBare(specifier, parentURL) {
  if (!(specifier.startsWith("./") || specifier.startsWith("../") || specifier === ".")) return null;
  if (/\.[a-z]+$/i.test(specifier)) return null;
  if (!parentURL) return null;
  const parentDir = nodePath.dirname(fileURLToPath(parentURL));
  // Para "." o "./" el directorio a resolver ES parentDir.
  const targetBase = (specifier === "." || specifier === "./")
    ? parentDir
    : nodePath.resolve(parentDir, specifier);
  const candidates = [
    targetBase + ".ts",
    targetBase + ".tsx",
    nodePath.join(targetBase, "index.ts"),
    nodePath.join(targetBase, "index.tsx"),
    targetBase + ".mjs",
    targetBase + ".js",
    nodePath.join(targetBase, "index.mjs"),
    nodePath.join(targetBase, "index.js"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // Node ESM no añade `.js` a este subpath de Next cuando se ejecutan las
  // rutas App Router fuera de Next. En el harness se resuelve al runtime
  // local para que cada test pueda mockear `next/server` de forma explícita.
  if (specifier === "next/server") {
    const nextServer = nodePath.join(baseUrl, "node_modules", "next", "server.js");
    if (existsSync(nextServer)) return nextResolve(pathToFileURL(nextServer).href, context);
  }
  // 1. Resolver aliases @/foo/bar
  if (specifier.startsWith("@/")) {
    const resolved = resolveAlias(specifier);
    if (resolved) {
      const url = pathToFileURL(resolved).href;
      return nextResolve(url, context);
    }
  }
  // 2. Resolver relativos sin extensión (./foo, ../bar)
  const relativeResolved = resolveRelativeBare(specifier, context.parentURL);
  if (relativeResolved) {
    return nextResolve(relativeResolved, context);
  }
  return nextResolve(specifier, context);
}
