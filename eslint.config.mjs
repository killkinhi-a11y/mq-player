import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// ── no-prisma-direct-in-api ─────────────────────────────────────────────────
// Custom rule (M2): forbid `import { db } from "@/lib/db"` (or relative
// equivalents) inside src/app/api/**. The Prisma client talks to PostgreSQL
// locally, but production runs on Turso (libSQL) via src/lib/database.ts —
// any route that uses `db.*` directly will throw at runtime in production.
//
// Allow-list: src/app/api/db-sync/route.ts (the Prisma→Turso bridge).
// To add another exception, append to `prismaAllowList` below.
const prismaAllowList = new Set([
  "src/app/api/db-sync/route.ts",
]);

const noPrismaDirectInApi = {
  meta: {
    type: "problem",
    docs: {
      description: "Forbid importing Prisma client (`db`) inside API routes — use the Turso adapter from `@/lib/database` instead.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename || "";
    const isApiRoute = filename.includes("/src/app/api/") || filename.includes("\\src\\app\\api\\");
    if (!isApiRoute) return {};
    const normalized = filename.replace(/\\/g, "/");
    const rel = normalized.split("/src/app/api/")[1];
    if (!rel) return {};
    const relPath = `src/app/api/${rel}`;
    if (prismaAllowList.has(relPath)) return {};
    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        // Match "@/lib/db" or any path ending in "/db" that imports the Prisma client
        const isDbImport = src === "@/lib/db" || /(^|\/)lib\/db$/.test(src);
        if (!isDbImport) return;
        // Allow if a named import called `database` is being pulled from a
        // file that ALSO exports db — but in this repo, lib/db.ts only exports
        // `db` (Prisma). Flag it.
        const importedNames = (node.specifiers || []).map((s) => s.imported?.name || s.local?.name);
        if (importedNames.includes("db")) {
          context.report({
            node,
            message:
              "Do not import `db` from Prisma client inside API routes — production runs on Turso. " +
              "Import from `@/lib/database` instead. " +
              "If you genuinely need Prisma (e.g. db-sync bridge), add the file to `prismaAllowList` in eslint.config.mjs.",
          });
        }
      },
    };
  },
};

// ── no-sub-11px-text (P2.5) ──────────────────────────────────────────────────
// Bans text-[Npx] where N < 11 — below the legibility floor.
const noSub11pxText = {
  meta: {
    type: "problem",
    docs: { description: "Ban text-[Npx] classes where N < 11 (legibility floor)" },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.name !== "className") return;
        const value = node.value;
        if (!value || value.type !== "Literal") return;
        const val = String(value.value || "");
        const matches = val.matchAll(/text-\[(\d+)px\]/g);
        for (const m of matches) {
          const px = parseInt(m[1]);
          if (px < 11) {
            context.report({
              node,
              message: `text-[${px}px] is below the 11px legibility floor. Use text-[11px] or larger, or use a --mq-text-* token.`,
            });
          }
        }
      },
    };
  },
};

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "dist/**",
      "dist-electron/**",
      "mq-player-src/**",
      "public/**",
      "*.config.*",
      "scripts/**",
      // Vendored skill tooling (pdf/ppt build scripts) — not application code,
      // never imported by the app, and uses its own CJS/module conventions.
      "skills/**",
    ],
  },
  // Base: eslint-config-next 16 ships a FLAT config array natively.
  // NOTE (Phase 2C): `core-web-vitals` alone registers only the JS/react/
  // next plugins — the @typescript-eslint plugin comes from the separate
  // `eslint-config-next/typescript` export. Without it, any
  // "@typescript-eslint/*" rule below crashed ESLint with
  // "could not find plugin @typescript-eslint" — `npm run lint` could
  // never actually run in this repo.
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "mq-internal": { rules: { "no-prisma-direct-in-api": noPrismaDirectInApi, "no-sub-11px-text": noSub11pxText } },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react/no-unescaped-entities": "off",
      "prefer-const": "warn",
      "no-empty": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "mq-internal/no-prisma-direct-in-api": "error",
      "mq-internal/no-sub-11px-text": "error",
    },
  },
  {
    // Electron main/preload are CommonJS by design (electron's runtime contract
    // for the main process) — require() is the intended pattern there.
    files: ["electron/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];

export default eslintConfig;

