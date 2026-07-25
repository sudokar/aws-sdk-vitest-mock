/**
 * ESM loader hook: redirects `import "typescript"` to `@typescript/typescript6`.
 * Registered by typedoc-ts6-shim.mjs via node:module register().
 *
 * See: https://github.com/TypeStrong/typedoc/issues/3098
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "typescript") {
    return nextResolve("@typescript/typescript6", context);
  }
  return nextResolve(specifier, context);
}
