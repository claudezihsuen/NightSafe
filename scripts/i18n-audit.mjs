import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = path.resolve("src");
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name) && !full.endsWith(path.join("i18n", "translations.ts"))) files.push(full);
  }
}
walk(root);

const attributeNames = new Set([
  "title", "description", "label", "placeholder", "aria-label", "helperText", "hint",
  "emptyTitle", "emptyDescription", "confirmText", "cancelText", "message", "caption",
]);
const callNames = new Set([
  "alert", "confirm", "prompt", "setError", "setMessage", "setFeedback", "setSuccess",
  "setStatus", "setNotice", "setWarning", "setBanner", "setToast",
]);

function looksHuman(text) {
  const s = text.replace(/\s+/g, " ").trim();
  if (s.length < 2 || !/[A-Za-z]/.test(s)) return false;
  if (/^(https?:|\/api\/|\/|\.\/|\.\.\/|[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$)/.test(s)) return false;
  if (/^[A-Z0-9_]+$/.test(s) && s.includes("_")) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|EN|ZH|TA)$/.test(s)) return false;
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
          if (ts.isNoSubstitutionTemplateLiteral(arg)) add(file, arg, `call:${name}`, arg.text);
          if (ts.isTemplateExpression(arg)) add(file, arg, `call:${name}`, arg.getText(sf));
        }
      }
    }

    // Common UI object properties and React props assembled in variables.
    if (ts.isPropertyAssignment(node)) {
      const key = node.name.getText(sf).replace(/["']/g, "");
      if (["title", "description", "label", "message", "name", "subtitle", "emptyText", "buttonText"].includes(key)) {
        const init = node.initializer;
        if (ts.isStringLiteralLike(init)) add(file, init, `property:${key}`, init.text);
        if (ts.isNoSubstitutionTemplateLiteral(init)) add(file, init, `property:${key}`, init.text);
      }
    }

    ts.forEachChild(node, visit);
  }
  visit(sf);
}

const deduped = [...new Map(rows.map((row) => [`${row.file}:${row.line}:${row.kind}:${row.text}`, row])).values()]
  .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

console.log(`I18N_AUDIT_CANDIDATES=${deduped.length}`);
for (const row of deduped) console.log(`${row.file}:${row.line} [${row.kind}] ${row.text}`);
