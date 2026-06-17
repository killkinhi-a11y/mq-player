import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: null,
});

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
    ],
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      "mq-internal": { rules: { "no-prisma-direct-in-api": noPrismaDirectInApi } },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "react/no-unescaped-entities": "off",
      "prefer-const": "warn",
      "no-empty": "off",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "mq-internal/no-prisma-direct-in-api": "error",
    },
  },
];

export default eslintConfig;

