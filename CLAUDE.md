@AGENTS.md

# From Scratch: instruções para o Claude Code

Memória do projeto entre sessões. **Mantenha este arquivo, `docs/PROGRESS.md` e
`docs/DECISIONS.md` atualizados** ao fim de cada tarefa.

## O que é

App web local (Next.js) que transforma um pedido em linguagem natural em um projeto de drone real:
3D em escala, peças reais, custos em R$, dificuldade por domínio, onde fazer, riscos e guia de
montagem com tutor. A fonte da verdade do produto é **`docs/SPEC.md`** (leia antes de qualquer
fase). O dono do projeto usa **Windows** e tem nível intermediário de programação: explique
decisões importantes de forma breve.

## Estado atual

- **Fase 0 (fundação): concluída** (CI verde no Windows e no Linux). Próxima: **Fase 1
  (domínio)**, que só começa depois da revisão do plano em `docs/PROGRESS.md` e das perguntas
  listadas lá.
- A arquitetura do Arquétipo 1 (o drone real do dono) está **proposta** no ADR-0013, com as
  fontes oficiais lidas (ArduPilot, QGroundControl, ExpressLRS). Atenção: no ArduCopter 4.7 o
  `RTL_ALT` (cm) virou `RTL_ALT_M` (m).
- Trabalhe **uma fase por vez**: plano curto no início; no fim, resumo + como testar + o que ficou
  de fora; depois **pare e espere a revisão** (SPEC B.18).

## Comandos

| Comando                  | Uso                                                                      |
| ------------------------ | ------------------------------------------------------------------------ |
| `pnpm install`           | Instala dependências (pnpm 11, versão fixada em `packageManager`).       |
| `pnpm dev`               | App em http://localhost:3000.                                            |
| `pnpm check`             | **Antes de cada commit**: formatação + lint + tipos + testes de unidade. |
| `pnpm test`              | Vitest (unidade).                                                        |
| `pnpm test:e2e`          | Playwright (sobe o `pnpm dev` sozinho). Rode quando mexer em UI.         |
| `pnpm build`             | Build de produção (também faz type-check).                               |
| `pnpm lint` / `lint:fix` | ESLint (`--max-warnings=0`).                                             |
| `pnpm typecheck`         | `next typegen && tsc --noEmit`.                                          |
| `pnpm format`            | Prettier.                                                                |
| `pnpm shadcn add <nome>` | Novo componente do shadcn/ui (estilo `new-york`, Radix).                 |

## Regras inegociáveis (resumo da SPEC B.1 e B.19)

1. **Hierarquia da verdade:** catálogo curado → motor de cálculo determinístico → LLM. O LLM nunca
   produz número de engenharia (massa, empuxo, corrente, KV, dimensões, preço).
2. **Nunca invente** specs, preços, URLs, produtos ou regras legais. Sem fonte conferida, deixe
   vazio e marque o selo (✅ verificado · ⚠️ estimativa · ❓ não verificado). Links de compra são
   **links de busca**, nunca anúncios específicos.
3. **Honestidade sobre inviabilidade**, com os números do motor de cálculo e a alternativa viável
   mais próxima.
4. **Segurança primeiro:** alertas explícitos, checkpoints bloqueantes, recusa de armas, químicos,
   jammers, vigilância e ocultação (SPEC B.9).
5. **Linguagem para leigos** em toda a UI (PT-BR), com glossário.
6. **`src/domain/` é TypeScript puro**: sem React/Next/LLM/three.js/banco/I-O. O ESLint bloqueia
   esses imports (ADR-0008). Dados entram por parâmetro.
7. **Segredos** só em `.env.local` (ignorado pelo git). Nunca em código ou commit.
8. Dependência fora da lista da SPEC B.3 só com justificativa em `docs/DECISIONS.md`.
9. Ao fim de cada fase: **revisão adversarial** (o que machucaria um leigo? o que faria o drone não
   voar? o que estouraria o orçamento?) e uma linha com os dados do catálogo que o dono precisa
   verificar.

## Windows primeiro

- Scripts do `package.json` sem sintaxe de bash (`rm -rf`, `cp`, `VAR=valor`, aspas simples, `;`).
  O teste `tests/unit/windows-compat.test.ts` recusa isso. Para tarefas de arquivo, use scripts
  `.mjs`/`.ts` com APIs do Node.
- Caminhos com `path.join`/`path.resolve`, nunca `/` fixo em código de sistema de arquivos.
- Dependência nativa só com binário pré-compilado para `win32-x64` e registrada em `allowBuilds`
  (`pnpm-workspace.yaml`, ADR-0003).
- Finais de linha LF (`.gitattributes`, ADR-0010).
- O CI (`.github/workflows/ci.yml`) roda tudo no Windows e no Linux a cada push: confira o
  resultado depois de enviar.

## Arquitetura (alvo da SPEC B.4)

```
docs/                 SPEC (íntegra, não formatar), DECISIONS, PROGRESS, GLOSSARIO
data/catalog/drone/   catálogo curado versionado (Fase 1)
src/domain/core/      tipos genéricos (Fase 1)
src/domain/categories/drone/  schema, compatibilidade, cálculos, solver, dificuldade, custos,
                      locais, segurança, cena 3D (Fases 1-2)
src/server/           llm, pipeline, tutor, uploads, budget, db (Fases 1, 4, 6, 7)
src/app/              rotas Next (páginas + API)
src/components/       UI; ui/ = shadcn/ui (copiados do registro oficial, ADR-0004)
tests/unit/           Vitest · tests/e2e/ Playwright · tests/evals/ (Fase 4)
```

## Convenções

- Textos de UI, comentários, docs e mensagens de commit em **PT-BR**. Commits pequenos, com
  prefixo (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`).
- Comente o **porquê** das regras de engenharia, com a fonte.
- TypeScript estrito com `noUncheckedIndexedAccess` (ADR-0007).
- Next.js 16.3: antes de escrever código de Next, leia o guia correspondente em
  `node_modules/next/dist/docs/` (veja `AGENTS.md`). Use `LayoutProps`/`PageProps` globais.
- API do Claude (Fase 4+): consulte a skill `claude-api` antes de escrever integração; modelos por
  rota em `src/server/llm/config.ts` (padrão `claude-opus-5-5`, não trocar por conta própria).

## Sessões do Claude Code na nuvem

- A rede pode ser restrita. Em out/2026 estavam bloqueados `ui.shadcn.com`, `pnpm.io`,
  `ardupilot.org`, `docs.qgroundcontrol.com` e `gov.br`; o registro do npm, `git clone` de
  repositórios públicos do GitHub e `raw.githubusercontent.com` funcionavam. Para componentes do
  shadcn, copie de `shadcn-ui/ui` → `apps/v4/registry/new-york-v4/ui/`.
- Documentação oficial pelo código-fonte no GitHub (clone esparso, sem baixar o repositório todo):
  `ArduPilot/ardupilot_wiki` (`common/source/docs/`, `copter/source/docs/`),
  `mavlink/qgroundcontrol` (`docs/en/`), `ExpressLRS/Docs` (`docs/`) e as notas de versão em
  `ArduPilot/ardupilot` (`ArduCopter/ReleaseNotes.txt`). Cite o commit usado.
- O Playwright do contêiner não baixa navegador: rode os E2E com
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`.
