#!/usr/bin/env node
/**
 * Bundle Analyzer Helper — identifies unused shadcn/ui components
 *
 * Scans src/components/mq/ and src/app/ for imports of shadcn/ui components
 * from src/components/ui/, then reports which UI components are never imported
 * by the application (only by other UI components or not at all).
 *
 * Usage: node scripts/analyze-bundle.mjs
 */

import { readdir, readFile } from "fs/promises";
import { join, relative } from "path";

const SRC_DIR = join(process.cwd(), "src");
const UI_DIR = join(SRC_DIR, "components", "ui");
const APP_DIRS = [
  join(SRC_DIR, "components", "mq"),
  join(SRC_DIR, "app"),
  join(SRC_DIR, "store"),
  join(SRC_DIR, "hooks"),
  join(SRC_DIR, "lib"),
];

async function getAllFiles(dir, ext = ".tsx") {
  const files = [];
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await getAllFiles(fullPath, ext));
      } else if (entry.name.endsWith(ext) || entry.name.endsWith(".ts")) {
        files.push(fullPath);
      }
    }
  } catch {}
  return files;
}

async function main() {
  console.log("🔍 MQ Player — Bundle Analysis: Unused shadcn/ui components\n");

  const uiFiles = await getAllFiles(UI_DIR);
  const uiComponentNames = new Set(uiFiles.map((f) => f.replace(/\.tsx?$/, "").split("/").pop()));

  console.log(`📦 Found ${uiComponentNames.size} shadcn/ui components\n`);

  const appFiles = [];
  for (const dir of APP_DIRS) {
    appFiles.push(...await getAllFiles(dir));
  }

  const usedComponents = new Set();
  const importMap = {};

  for (const file of appFiles) {
    try {
      const content = await readFile(file, "utf-8");
      for (const name of uiComponentNames) {
        const patterns = [
          new RegExp(`from\\s+['"][^'"]*/ui/${name}['"]`),
          new RegExp(`from\\s+['"]@/components/ui/${name}['"]`),
        ];
        for (const pattern of patterns) {
          if (pattern.test(content)) {
            usedComponents.add(name);
            if (!importMap[name]) importMap[name] = [];
            importMap[name].push(relative(process.cwd(), file));
            break;
          }
        }
      }
    } catch {}
  }

  for (const uiFile of uiFiles) {
    try {
      const content = await readFile(uiFile, "utf-8");
      const sourceName = uiFile.split("/").pop()?.replace(/\.tsx?$/, "");
      for (const name of uiComponentNames) {
        if (name === sourceName) continue;
        const pattern = new RegExp(`from\\s+['"]@/components/ui/${name}['"]`);
        if (pattern.test(content)) {
          usedComponents.add(name);
          if (!importMap[name]) importMap[name] = [];
          importMap[name].push(`(ui→ui) ${relative(process.cwd(), uiFile)}`);
        }
      }
    } catch {}
  }

  const unused = [...uiComponentNames].filter((n) => !usedComponents.has(n)).sort();
  const used = [...usedComponents].sort();

  console.log("✅ USED components:");
  for (const name of used) {
    const sources = importMap[name] || [];
    const sourceCount = sources.filter((s) => !s.startsWith("(ui→ui)")).length;
    console.log(`   ${name} — ${sourceCount} app import(s)`);
  }

  console.log(`\n❌ UNUSED components (candidates for removal):`);
  if (unused.length === 0) {
    console.log("   None — all components are used!");
  } else {
    for (const name of unused) {
      console.log(`   ${name}`);
    }
  }

  console.log(`\n📊 Summary: ${used.length} used, ${unused.length} unused out of ${uiComponentNames.size} total`);

  if (unused.length > 0) {
    const radixMap = {
      "accordion": "@radix-ui/react-accordion",
      "alert-dialog": "@radix-ui/react-alert-dialog",
      "aspect-ratio": "@radix-ui/react-aspect-ratio",
      "avatar": "@radix-ui/react-avatar",
      "checkbox": "@radix-ui/react-checkbox",
      "collapsible": "@radix-ui/react-collapsible",
      "context-menu": "@radix-ui/react-context-menu",
      "hover-card": "@radix-ui/react-hover-card",
      "menubar": "@radix-ui/react-menubar",
      "navigation-menu": "@radix-ui/react-navigation-menu",
      "radio-group": "@radix-ui/react-radio-group",
      "toggle": "@radix-ui/react-toggle",
      "toggle-group": "@radix-ui/react-toggle-group",
    };
    console.log("\n💡 To remove unused components and save bundle size:");
    const pkgs = unused.map((n) => radixMap[n] || "").filter(Boolean);
    if (pkgs.length) console.log("   npm uninstall " + pkgs.join(" "));
    console.log("\n   Then delete the UI component files:");
    for (const name of unused) {
      console.log(`   rm src/components/ui/${name}.tsx`);
    }
  }
}

main().catch(console.error);
