---
name: server-build-and-imports
description: Why apps/server uses Node package.json#imports (#lib/dates, #db/schema/core) instead of tsconfig paths, why tsc is --noEmit while esbuild bundles, why the server ships no declarations, and why vercel.json's outputDirectory is load-bearing. Use before touching the server's tsconfig, package.json imports/exports map, build script or Vercel config — or when debugging a deploy failure, a TS7056, or a module-resolution error.
---

# Server build and imports

This is a "don't undo this" document. Every rule here replaced something that broke, and the
symptoms show up far from the cause. Read `CLAUDE.md` first — it wins on any conflict.

## `#subpaths`, not tsconfig `paths`

The server's non-relative imports are Node's own `package.json#imports` (`#lib/dates`,
`#db/schema/core`) — **not** `@/*` path aliases like the web's. Don't "fix" this by adding `paths`
back, and don't carry the web's barrel convention across: `apps/web` keeps
`modules/<domain>/<mechanism>/index.ts` because `@/*` still resolves a folder, and the server
deliberately does not.

- **Every `#` specifier names a file.** Node does no directory resolution and, unlike `tsc`, will not
  fall through an array of fallback targets — so there is no folder-barrel to import through the
  `imports` map: `#db/core`, `#db/schema/core`, `#modules/ingredients/ingredients.model`. An
  `index.ts` that only re-exports one sibling is a file and a hop for nothing; an `index.ts` that
  genuinely defines something (the db client, the schema barrel over 11 files) is named `core.ts`
  instead. `src/index.ts` is the exception and must keep its name — it is the Vercel Hono entrypoint.
- **The one sanctioned folder-barrel is a feature module's `index.ts`**, and it is reached by a
  *relative* directory import, not a `#` one: `src/index.ts` does `import usersApp from
  './modules/users'`. Node could not resolve that either — esbuild is what turns it into something
  runnable, which is the same reason the `.tsx` email templates work. So the rule is about the
  `imports` map, not about the whole codebase: outside `src/index.ts`'s mount list, still name the
  file.
- **Adding a top-level directory under `src/` means adding a line to the `imports` map.** It is one
  wildcard per directory and stays that size.
- **This is what lets the server ship no declarations.** The web resolves `@homewise/server` to
  *source*, and `#imports` resolve from the server's own package.json whichever project is compiling
  — so `apps/web/tsconfig.json` needs no `references`, the server needs no `composite`, and with
  declaration emit off, `TS7056` and the zod `$strip` portability error cannot occur. `paths` would
  re-impose the whole chain, and Vercel's Node runtime documents support for neither path mappings
  nor project references.
- **`tsc` never emits here — esbuild does.** `build` bundles `src/index.ts` to `dist/index.js`
  (`--packages=external`, so only npm deps stay unresolved), and `tsc` runs solely as `--noEmit`. The
  bundler is what turns `#imports`, the `.tsx` email templates and the extensionless directory
  imports into something Node can run.
- **`vercel.json`'s `outputDirectory: dist` is load-bearing — never drop it.** `@vercel/hono` only
  searches the output directory for its entrypoint when that is set; otherwise it globs the project
  root, finds `src/index.ts`, and hands a `.ts` entrypoint to `@vercel/node`'s vendored ts-node. That
  drives the **TypeScript 5** compiler API, so on this repo's TypeScript 7 — whose npm package
  exports just `{ version, versionMajorMinor }` — the build dies on `ts.sys.readFile`. Pinning an
  older TypeScript wouldn't rescue it either: that path transpiles per file and never rewrites
  specifiers, so `./modules/users` would resolve to nothing at runtime.

## The other half: `#exports`

Where `#imports` is how the server reaches its own files, `package.json#exports` is how the web
reaches them. **A module may expose more than one subpath.** Each maps to exactly one file — there is
no barrel to hide behind — so a module whose constants the web also needs gets a second entry beside
its model: `@homewise/server/contacts` is `contacts.model.ts`, `@homewise/server/contacts/constants`
is `contacts.constants.ts`.

The Hono `AppType` exported from `apps/server/src/index.ts` is the contract the web client consumes
— **keep it exported**. It is one chained `typeof routes`; if it ever has to become a union again,
union with `|`, never an intersection (an intersection silently yields an `unknown` RPC client).
Always probe the resulting client type after touching it — see `server-conventions` for the probe.

## Related skills

`server-conventions` for what goes inside a module · `unit-testing` (esbuild bundles only what
`src/index.ts` reaches, which is why colocated `*.test.ts` files never enter `dist`).
