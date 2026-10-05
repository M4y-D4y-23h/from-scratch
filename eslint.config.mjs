import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

// src/domain é TypeScript puro (SPEC B.1.7): sem React/Next, sem LLM, sem 3D,
// sem banco e sem I/O. Ele recebe dados e devolve resultados; quem lê arquivo,
// banco ou rede são as camadas de cima (src/server, src/app).
const domainRestrictedImports = [
  {
    group: ["react", "react/*", "react-dom", "react-dom/*", "next", "next/*"],
    message: "src/domain não pode depender de React/Next (SPEC B.1.7).",
  },
  {
    group: ["@anthropic-ai/*", "openai", "openai/*", "ai", "@ai-sdk/*"],
    message:
      "src/domain não chama LLM: números vêm do catálogo e do motor de cálculo (SPEC B.1.1).",
  },
  {
    group: ["three", "three/*", "@react-three/*"],
    message: "src/domain só descreve a cena em JSON; quem desenha é a UI (SPEC B.11).",
  },
  {
    group: ["drizzle-orm", "drizzle-orm/*", "@libsql/*", "better-sqlite3", "sharp", "server-only"],
    message: "Banco, imagens e I/O ficam em src/server.",
  },
  {
    group: ["@/app/*", "@/components/*", "@/server/*", "@/lib/*", "@/hooks/*"],
    message: "src/domain não depende das camadas de cima (app, components, server).",
  },
  {
    // Mesma regra para caminhos relativos que saem do domínio (ex.: "../../server/db").
    regex: "^(\\.\\./)+(app|components|server|lib|hooks)(/.*)?$",
    message: "src/domain não depende das camadas de cima (app, components, server).",
  },
  {
    regex:
      "^(node:)?(fs|path|os|child_process|http|https|net|crypto|stream|url|worker_threads|process)(/.*)?$",
    message: "src/domain não faz I/O nem depende de APIs do Node; receba os dados por parâmetro.",
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/domain/**/*.{ts,tsx,mts}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: domainRestrictedImports }],
    },
  },
  // Desliga regras de estilo que brigam com o Prettier (ele formata; o ESLint aponta bugs).
  prettier,
  globalIgnores([
    // Ignorados por padrão no eslint-config-next:
    ".next/**",
    ".next-e2e/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Saídas de teste:
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
