import ts from "typescript";

const files = [
  "supabase/functions/_shared/app-url.ts",
  "supabase/functions/_shared/security.ts",
  "supabase/functions/_shared/meta.ts",
  "supabase/functions/_shared/meta-sync.ts",
  "supabase/functions/_shared/meta-rules-core.ts",
  "supabase/functions/_shared/meta-bulk-plan.ts",
  "supabase/functions/meta-manage/index.ts",
  "supabase/functions/meta-disconnect/index.ts",
  "supabase/functions/meta-sync/index.ts",
  "supabase/functions/meta-auth-callback/index.ts",
  "supabase/functions/meta-oauth-callback/index.ts",
  "supabase/functions/meta-rules/index.ts",
  "supabase/functions/meta-auth-start/index.ts",
  "supabase/functions/meta-assets/index.ts",
  "supabase/functions/meta-bulk/index.ts",
];

const program = ts.createProgram(files, {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  noEmit: true,
  skipLibCheck: true,
  strict: false,
  lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
});

const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  if (diagnostic.code === 2307 || diagnostic.code === 5097) return false;
  if (diagnostic.code === 2304 && message.includes("'Deno'")) return false;
  return true;
});

for (const diagnostic of diagnostics) {
  const position =
    diagnostic.file && diagnostic.start != null
      ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start)
      : null;
  const location = position
    ? `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1}`
    : diagnostic.file?.fileName || "Meta Edge Function";
  console.error(
    `${location} TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
  );
}

if (diagnostics.length) process.exit(1);
console.log(
  `Semantic check passed for ${files.length} Meta Edge TypeScript files (Deno/npm URL imports excluded).`,
);
