// Store analysis for docs/STORE_STATE_MAP.md (Stage IV, task C).
// Usage: node scripts/store/analyze-store.mjs . > store-analysis.json
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";
const root = process.argv[2];
const rd = (p) => fs.readFileSync(path.join(root, p), "utf8");
const parse = (p, txt = rd(p)) => ts.createSourceFile(p, txt, ts.ScriptTarget.Latest, true, p.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const walk = (n, f) => { f(n); ts.forEachChild(n, (c) => walk(c, f)); };

// 1. keys
const types = parse("src/store/types.ts");
let appState; walk(types, (n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === "AppState") appState = n; });
const actionKeys = new Set(), declaredKeys = [];
for (const m of appState.members) {
  const name = m.name?.getText(types); if (!name) continue;
  declaredKeys.push(name);
  if (ts.isMethodSignature(m) || (m.type && (ts.isFunctionTypeNode(m.type)))) actionKeys.add(name);
}
const init = parse("src/store/initialState.ts");
const dataKeys = [];
walk(init, (n) => { if (ts.isVariableDeclaration(n) && n.name.getText(init) === "initialState") {
  let o = n.initializer; while (o && !ts.isObjectLiteralExpression(o)) o = o.expression;
  for (const p of o.properties) dataKeys.push(p.name.getText(init));
}});
const dataSet = new Set(dataKeys);
const dataNotInInit = declaredKeys.filter((k) => !actionKeys.has(k) && !dataSet.has(k));
// 2. persisted keys are taken at runtime (partializeState is a whitelist):
//    see src/__tests__/store/state-domains.test.ts
// 3. slice writers
const writers = {}; dataKeys.forEach((k) => (writers[k] = new Set()));
const sliceDir = "src/store/slices";
const storeFiles = fs.readdirSync(path.join(root, sliceDir)).filter((f) => f.endsWith(".ts") && f !== "index.ts").map((f) => `${sliceDir}/${f}`).concat(["src/store/useAppStore.ts"]);
const insideCall = (n, pred) => { for (let p = n.parent; p; p = p.parent) if (ts.isCallExpression(p) && pred(p)) return true; return false; };
for (const f of storeFiles) {
  const sf = parse(f); const owner = path.basename(f, ".ts");
  walk(sf, (n) => {
    if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && n.name && dataSet.has(n.name.getText(sf))) {
      if (insideCall(n, (c) => ["set", "useAppStore.setState", "setState"].includes(c.expression.getText(sf))) || owner === "useAppStore")
        writers[n.name.getText(sf)].add(owner === "useAppStore" ? "store-core" : owner);
    }
  });
}
// 4. walk all src files outside store
const files = [];
const rec = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
  const p = `${d}/${e.name}`;
  if (e.isDirectory()) { if (!["__tests__", "node_modules"].includes(e.name)) rec(p); }
  else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith(".d.ts")) files.push(p);
}};
rec("src");
const extWriters = {}; const selectorReads = {}; const getStateSites = [];
const cat = (f) => f.startsWith("src/store/") ? "store" : f.startsWith("src/lib/") ? "lib" : f.startsWith("src/hooks/") ? "hooks" : f.startsWith("src/components/") ? "components" : f.startsWith("src/app/") ? "app" : "other";
const isHookCall = (c, names) => ts.isCallExpression(c) && names.includes(c.expression.getText().replace(/^React\./, ""));
function context(n, sf) {
  // innermost function, and what it is
  let fn = null, chain = [];
  for (let p = n.parent; p; p = p.parent) {
    if (ts.isFunctionLike(p)) { chain.push(p); }
  }
  if (chain.length === 0) return "module";
  const inner = chain[0];
  const outer = chain[chain.length - 1];
  const fnName = (f) => {
    if (f.name) return f.name.getText(sf);
    const par = f.parent; if (par && ts.isVariableDeclaration(par)) return par.name.getText(sf);
    return "";
  };
  const isComponentOrHook = (f) => /^(use[A-Z0-9]|[A-Z])/.test(fnName(f)) && !ts.isMethodDeclaration(f);
  const hookArg = (f, names) => f.parent && ts.isCallExpression(f.parent) && f.parent.arguments[0] === f && isHookCall(f.parent, names);
  const isCompBody = (f) => isComponentOrHook(f) && (["components", "hooks"].includes(cat(sf.fileName)) || /^use[A-Z]/.test(fnName(f)));
  // Executed during render: innermost function is the component/hook body or a useMemo / useState / useRef initializer.
  if (isCompBody(inner) || hookArg(inner, ["useMemo", "useState", "useRef"])) return hookArg(inner, ["useState", "useRef"]) ? "render-init" : "render";
  for (const f of chain) {
    if (hookArg(f, ["useEffect", "useLayoutEffect", "useInsertionEffect"])) return "effect";
    if (hookArg(f, ["useCallback"])) return "callback";
    if (ts.isJsxExpression(f.parent) || (f.parent && f.parent.parent && ts.isJsxAttribute(f.parent.parent))) return "handler";
    if (isCompBody(f)) return "handler";
  }
  return "function";
}
for (const f of files) {
  const sf = parse(f);
  walk(sf, (n) => {
    if (!ts.isCallExpression(n)) return;
    const callee = n.expression.getText(sf);
    if (callee === "useAppStore.setState" && !f.startsWith("src/store/")) {
      walk(n.arguments[0] ?? n, (m) => { if ((ts.isPropertyAssignment(m) || ts.isShorthandPropertyAssignment(m)) && dataSet.has(m.name.getText(sf))) (extWriters[m.name.getText(sf)] ||= new Set()).add(f); });
    }
    if (callee === "useAppStore" && n.arguments[0] && (ts.isArrowFunction(n.arguments[0]) || ts.isFunctionExpression(n.arguments[0]))) {
      const a = n.arguments[0]; const param = a.parameters[0]?.name.getText(sf);
      walk(a.body, (m) => { if (ts.isPropertyAccessExpression(m) && m.expression.getText(sf) === param) { const k = m.name.text; (selectorReads[k] ||= new Set()).add(f); } });
    }
    if (callee === "useAppStore.getState") {
      const par = n.parent; let access = "snapshot", key = null;
      if (ts.isPropertyAccessExpression(par) && par.expression === n) {
        key = par.name.text;
        access = actionKeys.has(key) ? "action" : dataSet.has(key) ? "read" : "other";
      } else if (ts.isVariableDeclaration(par)) access = "snapshot";
      const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
      getStateSites.push({ file: f, line: line + 1, cat: cat(f), ctx: context(n, sf), access, key });
    }
  });
}
const out = {
  dataKeys, actionKeys: [...actionKeys], dataNotInInit,
  writers: Object.fromEntries(Object.entries(writers).map(([k, v]) => [k, [...v].sort()])),
  extWriters: Object.fromEntries(Object.entries(extWriters).map(([k, v]) => [k, [...v].sort()])),
  selectorReads: Object.fromEntries(Object.entries(selectorReads).map(([k, v]) => [k, v.size])),
  getStateSites,
};
process.stdout.write(JSON.stringify(out, null, 1));
