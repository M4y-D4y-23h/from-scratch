@AGENTS.md

# From Scratch: instruções para o Claude Code

Memória do projeto entre sessões. **Mantenha este arquivo, `docs/PROGRESS.md` e
`docs/DECISIONS.md` atualizados** ao fim de cada tarefa.

## O que é

App web local (Next.js) que transforma um pedido em linguagem natural em um projeto de drone real:
3D em escala, peças reais, custos em R$, dificuldade por domínio, onde fazer, riscos e guia de
montagem com tutor. A fonte da verdade do produto é **`docs/SPEC.md`** (leia antes de qualquer
fase) **junto com `docs/SPEC-ERRATA.md`** (o que na SPEC estava desatualizado; a SPEC não se
edita). O dono do projeto usa **Windows** e tem nível intermediário de programação: explique
decisões importantes de forma breve. Ele autorizou corrigir a SPEC quando ela estiver errada
(pesquisando a fonte certa) e decidir "da melhor maneira", justificando depois.

## Estado atual

- **Fases 0 (fundação), 1 (domínio) e 2 (3D): concluídas** (o dono liberou a Fase 3 em
  2026-10-05). **Fase 3 (painéis e /catalogo): concluída em 2026-10-05, aguardando a revisão do
  dono** (resumo, decisões pendentes e revisão adversarial em `docs/PROGRESS.md`). Próxima:
  **Fase 4 (pipeline com LLM, SPEC B.10)**, só depois da revisão.
- Páginas: `/` (drones de referência e projetos), `/referencia/[arquetipo]/[faixa]` e
  `/projetos/[id]` (resumo, 3D e as 6 abas; `?aba=`), `/catalogo` (+ `/catalogo/[tipo]/[id]` e
  `/catalogo/importacao`) e `/glossario`. `/3d/...` redireciona para `/referencia/...`.
- Projeto = escolha (slot → peça) guardada em versões no SQLite; kits e itens "fornecido_por" são
  recalculados (`swap.ts`, ADR-0024). Toda troca é revalidada no servidor; troca que deixa falha
  bloqueante é recusada.
- /catalogo grava nos JSON de `data/catalog/drone/` (validação do catálogo inteiro, escrita
  atômica, formato do Prettier; ADR-0025). Server actions que gravam chamam `assertLocalRequest`
  (só Host local) e validam a entrada com zod. `pnpm dev`/`start` escutam só em 127.0.0.1.
- Glossário: `docs/GLOSSARIO.md` alimenta os balões da interface (`<Glossed text=...>`). Verbete
  pode ter "Não sublinhar antes de:" para palavras que mudam o sentido ("receptor USB").
- 3D: `scene.ts` (domínio) monta o scene graph em JSON; `src/components/viewer3d` só desenha
  (three.js + @react-three/fiber + drei, ADR-0023). Rótulos são sprites desenhados em canvas (não
  use o `<Html>` do drei: erro no console do React 19).
- Motor de cálculo em `src/domain/categories/drone/` (35 regras, solver das 3 faixas, custos,
  dificuldade, locais, alertas, comparação de tamanho, montar × pronto); catálogo real dos 3
  arquétipos em `data/catalog/drone/` (tudo ❓ até o dono conferir). `pnpm report` mostra os 9
  builds de referência.
- Arquétipo 1 (o drone real do dono): ArduCopter 4.7 + Pixhawk 6C/6C Mini + ELRS em modo MAVLink
  (ADR-0017). Nomes de parâmetros da 4.7 (`RTL_ALT_M` em metros, `ARMING_SKIPCHK`, `MAVn_*`).
- Arquétipos 2 e 3 em Betaflight 4.5 (nomes conferidos nas tags 4.5.3 e 2026.6.2; na 2026.6
  `failsafe_off_delay` virou `failsafe_landing_time`). Bateria LiHV 1S exige
  `vbat_max_cell_voltage = 440`; failsafe exigido = `DROP` com 1,5 s (ADR-0020).
- Trabalhe **uma fase por vez**: plano curto no início; no fim, resumo + como testar + o que ficou
  de fora; depois **pare e espere a revisão** (SPEC B.18).

## Comandos

| Comando                         | Uso                                                                        |
| ------------------------------- | -------------------------------------------------------------------------- |
| `pnpm install`                  | Instala dependências (pnpm 11, versão fixada em `packageManager`).         |
| `pnpm dev`                      | App em http://localhost:3000 (escuta só em 127.0.0.1).                     |
| `pnpm check`                    | **Antes de cada commit**: formatação + lint + tipos + testes de unidade.   |
| `pnpm test`                     | Vitest (unidade).                                                          |
| `pnpm test:e2e`                 | Playwright num servidor isolado (porta 3100, cópia do catálogo, ADR-0025). |
| `pnpm build`                    | Build de produção (também faz type-check).                                 |
| `pnpm lint` / `lint:fix`        | ESLint (`--max-warnings=0`).                                               |
| `pnpm typecheck`                | `next typegen && tsc --noEmit`.                                            |
| `pnpm format`                   | Prettier.                                                                  |
| `pnpm shadcn add <nome>`        | Novo componente do shadcn/ui (estilo `new-york`, Radix).                   |
| `pnpm report [a1] [--detalhes]` | Builds de referência no terminal (peças, números, custos, regras).         |
| `pnpm catalog:check`            | Valida o catálogo (`data/catalog/drone/`) e o glossário.                   |
| `pnpm catalog:format`           | Deixa os JSON do catálogo no formato que a página /catalogo grava.         |
| `pnpm db:sync`                  | Cria/atualiza o banco local (`data/local/`) a partir do catálogo.          |
| `pnpm db:generate`              | Gera migração do Drizzle (use `--name <nome>`).                            |

No VS Code, F5 roda o `pnpm install` (`.vscode/tasks.json`), sobe o app com o depurador e abre o
Edge (`.vscode/launch.json`, adaptado do guia
`node_modules/next/dist/docs/01-app/02-guides/debugging.md`: pnpm e servidor só em 127.0.0.1).

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
                      locais, segurança, cena 3D, lista de peças, troca (Fases 1-3)
src/server/           db, catalog (leitura e gravação), projects, project-view, actions,
                      security (Fases 1-3); llm, pipeline, tutor, uploads, budget (Fases 4-7)
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

- Rede: o dono liberou o acesso completo em out/2026 (antes, `ui.shadcn.com`, `ardupilot.org`,
  `docs.qgroundcontrol.com`, `pnpm.io` e `gov.br` estavam bloqueados). Mercado Livre e Amazon
  Brasil respondem com verificação de robô: não há preço brasileiro automático (ADR-0018). Para
  componentes do shadcn, copie de `shadcn-ui/ui` → `apps/v4/registry/new-york-v4/ui/`.
- Links assinados do DECEA (PDF das ICAs) expiram: cite a página da publicação, não o PDF.
- Documentação oficial pelo código-fonte no GitHub (clone esparso, sem baixar o repositório todo):
  `ArduPilot/ardupilot_wiki` (`common/source/docs/`, `copter/source/docs/`),
  `mavlink/qgroundcontrol` (`docs/en/`), `ExpressLRS/Docs` (`docs/`) e as notas de versão em
  `ArduPilot/ardupilot` (`ArduCopter/ReleaseNotes.txt`). Cite o commit usado.
- O Playwright do contêiner não baixa navegador: rode os E2E com
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium`.
- Os E2E sobem o próprio servidor (`scripts/e2e-server.mjs`): pasta de build `.next-e2e`,
  `tsconfig.e2e.json`, catálogo e banco temporários. Testes que mexem em totais comparam só o total
  que mudam (rodam em paralelo, e o "já tenho" vale para todos os projetos).
