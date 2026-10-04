import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Guarda da regra "todos os scripts do package.json funcionam no PowerShell"
 * (SPEC B.3). No Windows, o pnpm executa os scripts pelo cmd.exe, que não
 * entende sintaxe de bash. Este teste falha se alguém colocar um script que só
 * funciona em Linux/macOS.
 */

type Rule = { problem: string; pattern: RegExp };

// "Início de comando": começo da linha ou logo depois de &&, || ou |.
const CMD_START = String.raw`(?:^|&&|\|\||\|)\s*`;

const RULES: Rule[] = [
  {
    problem:
      "comando que só existe em bash (rm, cp, mv, mkdir -p, cat, grep, sed, touch, chmod, ln...)",
    pattern: new RegExp(
      `${CMD_START}(?:rm|cp|mv|cat|grep|sed|awk|touch|chmod|chown|ln|source|which)\\s`,
    ),
  },
  { problem: "mkdir -p (o mkdir do Windows não tem -p)", pattern: /\bmkdir\s+-p\b/ },
  {
    problem: "variável de ambiente no estilo bash (VAR=valor comando ou export VAR=)",
    pattern: new RegExp(`${CMD_START}(?:export\\s+)?[A-Za-z_][A-Za-z0-9_]*=`),
  },
  { problem: "expansão de variável no estilo bash ($VAR)", pattern: /\$\{?[A-Za-z_]/ },
  { problem: "aspas simples (o cmd.exe não as trata como aspas)", pattern: /'/ },
  { problem: "';' para separar comandos (o cmd.exe não entende; use &&)", pattern: /;/ },
  { problem: "redirecionamento para /dev/null (no Windows é NUL)", pattern: /\/dev\/null/ },
];

function findWindowsProblems(command: string): string[] {
  return RULES.filter(({ pattern }) => pattern.test(command)).map(({ problem }) => problem);
}

function readScripts(): Record<string, string> {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  return packageJson.scripts ?? {};
}

describe("scripts do package.json funcionam no Windows (PowerShell/cmd.exe)", () => {
  const scripts = readScripts();

  it("existem os scripts exigidos pela Fase 0", () => {
    for (const name of ["dev", "build", "test", "test:e2e", "lint", "typecheck"]) {
      expect(scripts, `falta o script "${name}"`).toHaveProperty(name);
    }
  });

  it.each(Object.entries(scripts))("o script %s não usa sintaxe só de bash", (_name, command) => {
    expect(findWindowsProblems(command)).toEqual([]);
  });
});

describe("o detector de problemas funciona (casos que DEVEM ser recusados)", () => {
  it.each([
    ["rm -rf .next", "bash"],
    ["next build && cp -r out dist", "bash"],
    ["mkdir -p data/local", "mkdir -p"],
    ["NODE_ENV=production next build", "variável de ambiente"],
    ["export FOO=1 && next dev", "variável de ambiente"],
    ["echo $HOME", "expansão"],
    ["eslint 'src/**/*.ts'", "aspas simples"],
    ["next build; next start", "';'"],
    ["next telemetry disable > /dev/null", "/dev/null"],
  ])("recusa %j", (command, expectedProblemFragment) => {
    const problems = findWindowsProblems(command);
    expect(problems.some((problem) => problem.includes(expectedProblemFragment))).toBe(true);
  });

  it.each([
    "next dev",
    "next typegen && tsc --noEmit",
    "eslint . --max-warnings=0",
    "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test",
    'prettier --check "src/**/*.ts"',
  ])("aceita %j", (command) => {
    expect(findWindowsProblems(command)).toEqual([]);
  });
});
