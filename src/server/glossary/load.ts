import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { type GlossaryTerm, parseGlossary } from "@/domain/core/glossary";

export const GLOSSARY_FILE = path.resolve(process.cwd(), "docs", "GLOSSARIO.md");

export type LoadedGlossary = { termos: GlossaryTerm[]; problemas: string[]; hash: string };

export function loadGlossary(file = GLOSSARY_FILE): LoadedGlossary {
  const markdown = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  return {
    ...parseGlossary(markdown),
    hash: createHash("sha256").update(markdown).digest("hex"),
  };
}
