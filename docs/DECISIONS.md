# Registro de decisões (ADR)

Cada decisão segue o formato curto **contexto → decisão → consequências**. Decisões novas entram no
fim, com número sequencial. Quando uma decisão for trocada, ela não é apagada: marque como
"Substituída por ADR-XXXX".

Datas no formato AAAA-MM-DD. "Verificado em" indica quando a informação externa foi conferida.

---

## ADR-0001: Versões do toolchain (out/2026)

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** em out/2026 várias ferramentas lançaram versões principais novas que ainda não
  funcionam entre si. Conferi as dependências declaradas (`peerDependencies`) no registro do npm
  e o modelo oficial do `create-next-app@16.3.8`.
- **Decisão:**

  | Ferramenta   | Versão          | Por que não a mais nova                                                                                                                                                                                                |
  | ------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Next.js      | 16.3.8          | é a mais nova estável.                                                                                                                                                                                                 |
  | React        | 19.2.8          | a 19.3.0 existe, mas o modelo oficial do Next 16.3.8 ainda fixa 19.2.8 (a combinação testada por eles).                                                                                                                |
  | TypeScript   | 5.9.3           | o `typescript-eslint` (usado pelo `eslint-config-next`) só aceita TypeScript < 6.1, e o TypeScript 7 (reescrito em Go) ainda não tem a API JavaScript. O modelo do Next também usa `^5`.                               |
  | ESLint       | 9.39.5          | os plugins que o `eslint-config-next` usa (`eslint-plugin-react` 7.37.5, `eslint-plugin-import` 2.32.0, `eslint-plugin-jsx-a11y` 6.10.2) declaram suporte só até o ESLint 9. O modelo oficial do Next também usa `^9`. |
  | Tailwind CSS | 4.3.3           | é a mais nova.                                                                                                                                                                                                         |
  | Vitest       | 5.0.3 (+Vite 8) | é a mais nova; o Vite é dependência "par" (peer) do Vitest 5 e foi declarado explicitamente.                                                                                                                           |
  | Playwright   | 1.63.0          | é a mais nova.                                                                                                                                                                                                         |
  | Node.js      | 24 LTS          | LTS ativa. `engines` aceita `^22.13 \|\| ^24 \|\| >=26` porque o Vitest 5 não suporta versões ímpares (23, 25) e o ESLint 9 pede 22.13+.                                                                               |

- **Consequências:**
  - O npm marca o ESLint 9 como "não suportado" desde o lançamento do ESLint 10 (fev/2026). O risco
    é baixo (é ferramenta de desenvolvimento, não roda no app), mas **revisar quando o
    `eslint-config-next` suportar o ESLint 10**.
  - Atualizar React para 19.3 e TypeScript para 6/7 quando o Next adotar essas versões no modelo
    oficial.

## ADR-0002: pnpm 11 fixado no `package.json`

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** existem três linhas ativas do pnpm: 10 (configuração antiga), 11 (estável desde
  abr/2026) e 12 (reescrita em Rust, estável desde 26/ago/2026). Segundo o anúncio oficial do
  pnpm 12, `winget`, Scoop e Chocolatey ainda não ofereciam a versão 12 no lançamento. O
  formato de configuração e do lockfile é o mesmo no 11 e no 12.
- **Decisão:** `"packageManager": "pnpm@11.28.2"` (a versão marcada como `latest-11` no npm). O
  README instala com `npm install --global pnpm@latest-11`.
- **Consequências:**
  - Quem tiver outra versão do pnpm instalada não precisa fazer nada: o pnpm baixa e usa a versão
    fixada automaticamente (configuração padrão `pmOnFail: download`).
  - O pnpm 11 exige Node 22+, só lê configurações do `pnpm-workspace.yaml` (o `.npmrc` fica só para
    registro/autenticação) e, por padrão, **não instala pacotes publicados há menos de 1 dia**
    (`minimumReleaseAge`), uma proteção contra pacotes maliciosos recém-publicados.
  - Migrar para o pnpm 12 deve ser só trocar a versão fixada, quando ele estiver mais maduro.

## ADR-0003: scripts de instalação de dependências (`allowBuilds`)

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** o pnpm 11 recusa a instalação quando alguma dependência quer rodar um script de
  instalação (`postinstall` etc.) que não foi explicitamente permitido ou negado. No Windows, scripts
  que compilam código nativo são a principal causa de "precisa instalar o Visual Studio Build Tools".
- **Decisão:** lista explícita em `pnpm-workspace.yaml`. Hoje há só um caso:
  `unrs-resolver: false`. O script dele é só um plano B para baixar o binário nativo, que já vem
  pré-compilado para cada sistema (inclusive `win32-x64`) como dependência opcional.
- **Consequências:** toda dependência nativa nova (driver do SQLite, `sharp`...) precisa ter binário
  pré-compilado para Windows e ser registrada aqui com a justificativa. O CI no Windows (ADR-0012)
  prova que a instalação funciona sem compilar nada.

## ADR-0004: shadcn/ui com o estilo `new-york` (Radix), instalado manualmente

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:**
  - Desde jul/2026 o padrão do shadcn/ui para projetos novos é o Base UI (estilos `base-*`), mas o
    Radix "não está sendo descontinuado" e continua recebendo todos os componentes novos (changelog
    oficial "July 2026 - Base UI as the Default").
  - A sessão de nuvem em que a Fase 0 foi feita tem a rede restrita e não alcança `ui.shadcn.com`,
    de onde o CLI baixa os componentes. O código-fonte oficial está no GitHub
    (`shadcn-ui/ui`), que é acessível.
- **Decisão:**
  - Seguir a instalação manual oficial (lida no código-fonte da documentação,
    [`apps/v4/content/docs/installation/manual.mdx`](https://github.com/shadcn-ui/ui/blob/295a1f114a138f23b5dfee0e0c6812394dfeb90c/apps/v4/content/docs/installation/manual.mdx),
    commit `295a1f1`, 2026-10-02), com `"style": "new-york"` no `components.json` (para Tailwind
    v4 o CLI usa os componentes `new-york-v4`, baseados em Radix).
  - Copiar `button`, `card` e `dropdown-menu` de `apps/v4/registry/new-york-v4/ui/` do mesmo commit.
  - O `components.json` foi validado com o schema do próprio CLI (`shadcn/schema`).
  - Radix porque é maduro em acessibilidade (a SPEC exige UI acessível) e porque o código estava
    disponível; dá para migrar para Base UI depois (há uma skill oficial de migração).
- **Dependências que vêm com o shadcn/ui** (fora da lista da SPEC B.3, justificadas aqui):
  - `cn`: junta classes CSS e resolve conflitos do Tailwind. Desde set/2026 os componentes oficiais
    importam dele (substitui `clsx` + `tailwind-merge`). Mantido pelo autor do shadcn, sem
    dependências, JavaScript puro.
  - `class-variance-authority`: variantes de componentes (ex.: botão `outline`, `ghost`).
  - `radix-ui`: comportamento acessível de menus, diálogos etc.
  - `lucide-react`: ícones.
  - `tw-animate-css`: animações usadas pelos componentes.
  - `shadcn` (devDependency): o CLI com versão fixa (`pnpm shadcn add <componente>`) e o arquivo
    `shadcn/tailwind.css` que a instalação oficial importa.
- **Consequências:** no seu computador (rede normal), adicione componentes com
  `pnpm shadcn add <nome>`. Componentes sempre do estilo `new-york`, para não misturar Radix e Base
  UI.

## ADR-0005: modo claro/escuro com `next-themes`

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** a SPEC pede modo claro/escuro. Sem cuidado, a página "pisca" no tema errado ao
  carregar.
- **Decisão:** `next-themes` (dependência fora da lista B.3), que é o caminho documentado pelo
  shadcn/ui para Next.js. Tema padrão: o do sistema operacional; o usuário pode fixar claro ou
  escuro no botão do topo.
- **Consequências:** a classe `dark` no `<html>` controla as cores (variáveis CSS em
  `src/app/globals.css`).

## ADR-0006: fonte do sistema (sem baixar fontes)

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** o modelo do Next usa `next/font/google`, que baixa a fonte da internet ao rodar
  `dev`/`build`. Sem internet, o build pode falhar.
- **Decisão:** usar a fonte padrão do sistema (no Windows, Segoe UI) via Tailwind.
- **Consequências:** zero dependência de rede para rodar. Se quisermos uma fonte própria no
  polimento (Fase 8), ela deve ser servida localmente.

## ADR-0007: TypeScript mais estrito que o padrão

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** o motor de cálculo vai trabalhar com tabelas (curvas de empuxo, listas de peças). O
  erro clássico é ler uma posição que não existe e seguir com `undefined` como se fosse número.
- **Decisão:** além de `strict`, ligar `noUncheckedIndexedAccess` (ler `lista[i]` devolve
  `T | undefined` e obriga a tratar a ausência), `noImplicitOverride` e
  `noFallthroughCasesInSwitch`. O `typecheck` roda `next typegen && tsc --noEmit` (o `typegen` gera
  os tipos das rotas, como `LayoutProps`, sem precisar de build). `typedRoutes: true` faz o
  TypeScript recusar links internos para rotas que não existem.
- **Consequências:** um pouco mais de código para tratar ausências, em troca de erros pegos na
  compilação, não na bancada.

## ADR-0008: ESLint + Prettier, e a pureza do domínio garantida pelo lint

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** a SPEC (B.1.7) exige que `src/domain/` seja TypeScript puro, sem React, Next ou
  LLM. Regra escrita em documento é esquecida; regra no lint, não.
- **Decisão:**
  - `eslint-config-next` (`core-web-vitals` + `typescript`) + `eslint-config-prettier` (desliga as
    regras de estilo que brigam com o Prettier; é a integração recomendada pela documentação do
    Next).
  - `no-restricted-imports` em `src/domain/**` proíbe: React/Next, SDKs de LLM, three.js, banco,
    `sharp`, APIs de I/O do Node (`fs`, `path`...) e imports das camadas de cima (`app`,
    `components`, `server`, `lib`). Testei a regra com um arquivo de propósito errado.
  - `pnpm lint` falha com qualquer aviso (`--max-warnings=0`).
  - Prettier com linhas de até 100 caracteres, finais de linha LF e `prettier-plugin-tailwindcss`
    (plugin oficial do Tailwind; ordena as classes sempre do mesmo jeito, o que deixa os diffs
    menores). `docs/SPEC.md` e `AGENTS.md` ficam fora do Prettier (texto íntegro / bloco gerenciado
    pelo Next).
- **Consequências:** se o domínio precisar de dados (catálogo, por exemplo), quem lê o arquivo ou o
  banco é a camada `src/server`, que passa os dados por parâmetro.

## ADR-0009: Vitest para unidade (Node) e Playwright para navegador (Chromium)

- **Data:** 2026-10-04 · **Status:** aceita
- **Decisão:**
  - Vitest em ambiente Node puro; testes em `src/**/*.test.ts` e `tests/unit/`.
  - Playwright só com Chromium (rápido; os screenshots do 3D da Fase 2 serão com ele). O
    Playwright sobe o `pnpm dev` sozinho e reaproveita um que já esteja aberto.
  - Variável opcional `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` para ambientes que não podem baixar o
    navegador (ex.: contêiner de nuvem). No Windows ela fica vazia e o Playwright usa o navegador
    baixado por `pnpm test:e2e:install`.
  - Primeiro teste de unidade útil: `tests/unit/windows-compat.test.ts` recusa scripts do
    `package.json` com sintaxe só de bash (`rm -rf`, `VAR=valor`, aspas simples, `;`...).
- **Consequências:** testes de componentes React (jsdom + Testing Library) ficam para quando houver
  componente com lógica que valha a pena (dependências a justificar na hora).

## ADR-0010: finais de linha sempre LF

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** o Git no Windows costuma converter LF para CRLF ao baixar os arquivos; o Prettier
  então acusa "arquivo mal formatado" em tudo.
- **Decisão:** `.gitattributes` com `* text=auto eol=lf` (o Git grava LF na sua pasta mesmo no
  Windows), `.editorconfig` para os editores, Prettier com `endOfLine: "lf"`. Exceções em CRLF:
  `.cmd`, `.bat`, `.ps1`.
- **Consequências:** nada a configurar no seu Git; o VS Code lida bem com LF.

## ADR-0011: `AGENTS.md` gerenciado pelo Next.js

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** o Next 16.3 traz a documentação dentro do pacote (`node_modules/next/dist/docs/`) e,
  ao rodar `next dev` com um agente de IA detectado, escreve um bloco de instruções no `AGENTS.md`
  (ou no `CLAUDE.md`, se o `AGENTS.md` não existir).
- **Decisão:** versionar o `AGENTS.md` com o bloco exatamente igual ao que o Next gera (conferido
  com a função do próprio Next) e fazer o `CLAUDE.md` importar o arquivo (`@AGENTS.md`).
- **Consequências:** o `CLAUDE.md` continua sendo nosso, e rodar `pnpm dev` não suja o repositório.

## ADR-0012: CI no GitHub Actions, no Windows e no Linux

- **Data:** 2026-10-04 · **Status:** aceita
- **Contexto:** o aceite da Fase 0 é "funciona no Windows", e o trabalho é feito em um ambiente
  Linux. Sem prova automática, só daria para descobrir problemas do Windows na sua máquina.
- **Decisão:** workflow `.github/workflows/ci.yml` que roda, a cada push e pull request, em
  `windows-latest` e `ubuntu-latest`: `pnpm install --frozen-lockfile`, formatação, lint, tipos,
  testes de unidade, `build` e os testes de navegador (Playwright).
- **Consequências:** usa minutos do GitHub Actions (em repositório privado, cada minuto de Windows
  conta em dobro na cota gratuita). Se a cota apertar, dá para limitar a execução a pull requests.
