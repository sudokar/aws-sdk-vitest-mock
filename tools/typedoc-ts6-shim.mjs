/**
 * Shim to make TypeDoc use @typescript/typescript6 instead of TypeScript 7.
 *
 * TypeDoc requires the TypeScript JS Compiler API (ts.SyntaxKind, ts.sys, etc.)
 * which was removed in TypeScript 7. @typescript/typescript6 is the official
 * TypeScript 6 compatibility shim that preserves this API.
 *
 * Loaded via `node --import` before running the typedoc binary so that any
 * ESM `import ... from "typescript"` call receives TypeScript 6 instead of 7.
 *
 * See: https://github.com/TypeStrong/typedoc/issues/3098
 */
import { register } from "node:module";

register("./typedoc-ts6-hook.mjs", import.meta.url);
