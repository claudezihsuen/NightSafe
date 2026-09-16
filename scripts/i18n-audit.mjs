import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("src");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (path.relative(root, full).replaceAll("\\", "/") === "i18n") continue;
      walk(full);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
      files.push(full);
    }
  }
}
walk(root);

function literalKeys(file) {
  const source = fs.readFileSync(path.resolve(file), "utf8");
  const keys = new Set();
  for (const match of source.matchAll(/^\s*"((?:[^"\\]|\\.)*)"\s*:/gm)) {
    try { keys.add(JSON.parse(`"${match[1]}"`)); } catch { keys.add(match[1]); }
  }
  return keys;
}

const baseKeys = literalKeys("src/i18n/translations.ts");
const zhKeys = literalKeys("src/i18n/expanded-zh.ts");
const taKeys = literalKeys("src/i18n/expanded-ta.ts");
const extraKeys = literalKeys("src/i18n/expanded-extra.ts");
const translatedLiterals = new Set([...baseKeys, ...zhKeys, ...extraKeys]);

const mismatchedExpandedKeys = [
  ...[...zhKeys].filter((key) => !taKeys.has(key)).map((key) => `Missing Tamil translation: ${key}`),
  ...[...taKeys].filter((key) => !zhKeys.has(key)).map((key) => `Missing Chinese translation: ${key}`),
];

const attributeNames = new Set([
  "title", "description", "label", "placeholder", "aria-label", "aria-description", "alt", "helperText", "hint",
  "emptyTitle", "emptyDescription", "confirmText", "cancelText", "message", "caption",
]);
const callNames = new Set([
  "alert", "confirm", "prompt", "setError", "setMessage", "setFeedback", "setSuccess",
  "setNotice", "setWarning", "setBanner", "setToast",
]);

function looksHuman(text) {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length < 2 || !/[A-Za-z]/.test(s)) return false;
  if (/^(https?:|\/api\/|\/|\.\/|\.\.\/|[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$)/.test(s)) return false;
  if (/^[A-Z0-9_]+$/.test(s) && s.includes("_")) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|EN|ZH|TA|authenticated|unauthenticated|loading)$/.test(s)) return false;
  if (/^[a-z0-9-]+(?:\s+[a-z0-9-:\/\[\].%]+){2,}$/i.test(s) && /(?:flex|grid|text-|bg-|border|rounded|px-|py-|mt-|mb-|gap-|w-|h-|sm:|md:|lg:|xl:|hover:|focus:)/.test(s)) return false;
  return true;
}

const rows = [];
function add(file, node, kind, text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!looksHuman(clean)) return;
  const sf = node.getSourceFile();
  const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  rows.push({ file: path.relative(process.cwd(), file).replaceAll("\\", "/"), line: pos.line + 1, kind, text: clean });
}

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isJsxText(node)) add(file, node, "jsx", node.getText(sf));

    if (ts.isJsxAttribute(node) && attributeNames.has(node.name.getText(sf))) {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) add(file, init, `attr:${node.name.getText(sf)}`, init.text);
      if (init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)) {
        add(file, init.expression, `attr:${node.name.getText(sf)}`, init.expression.text);
      }
    }

    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(sf).split(".").at(-1);
      if (callNames.has(name)) {
        for (const arg of node.arguments) {
          if (ts.isStringLiteralLike(arg)) add(file, arg, `call:${name}`, arg.text);
          else if (ts.isNoSubstitutionTemplateLiteral(arg)) add(file, arg, `call:${name}`, arg.text);
        }
      }
    }

    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(sf).replace(/["']/g, "");
      if (["title", "description", "label", "message", "name", "subtitle", "emptyText", "buttonText"].includes(key)) {
        const init = node.initializer;
        if (ts.isStringLiteralLike(init)) add(file, init, `property:${key}`, init.text);
        else if (ts.isNoSubstitutionTemplateLiteral(init)) add(file, init, `property:${key}`, init.text);
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sf);
}

const uniqueByText = new Map();
for (const row of rows) if (!uniqueByText.has(row.text)) uniqueByText.set(row.text, row);
const unique = [...uniqueByText.values()].sort((a, b) => a.text.localeCompare(b.text));
const missing = unique.filter((row) => !translatedLiterals.has(row.text));

console.log(`I18N_AUDIT_LOCATIONS=${rows.length}`);
console.log(`I18N_AUDIT_UNIQUE=${unique.length}`);
console.log(`I18N_AUDIT_MISSING_UNIQUE=${missing.length}`);
for (const row of missing) console.error(`${row.text} || ${row.file}:${row.line} [${row.kind}]`);
for (const issue of mismatchedExpandedKeys) console.error(issue);

if (missing.length || mismatchedExpandedKeys.length) process.exit(1);
