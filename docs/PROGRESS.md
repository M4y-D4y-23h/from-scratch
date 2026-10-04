# Progresso

O que foi feito por fase, o que falta e problemas conhecidos. Atualize ao fim de cada tarefa.

## Fase 0: Fundação (concluída em 2026-10-04, aguardando revisão)

**Feito:**

- `docs/SPEC.md` com a especificação na íntegra (fora do Prettier para não ser reformatada).
- App Next.js 16.3 (App Router) com React 19.2, TypeScript 5.9 estrito (com
  `noUncheckedIndexedAccess`), Tailwind CSS 4.3, shadcn/ui (estilo `new-york`, Radix) e modo
  claro/escuro (`next-themes`).
- Página inicial em PT-BR, acessível (link "pular para o conteúdo", landmarks, títulos em ordem),
  honesta sobre o estado ("Em construção"), com os selos de confiança explicados.
- ESLint 9 (`eslint-config-next` + `eslint-config-prettier`) com a regra que impede `src/domain`
  de importar React/Next/LLM/three.js/banco/I-O; Prettier com plugin do Tailwind.
- Vitest (Node) com o teste que recusa scripts só de bash no `package.json`; Playwright (Chromium)
  com testes da página inicial (idioma, título, aviso de construção, troca de tema).
- Scripts: `dev`, `build`, `start`, `test`, `test:watch`, `test:e2e`, `test:e2e:install`, `lint`,
  `lint:fix`, `typecheck`, `format`, `format:check`, `check`, todos sem sintaxe de bash.
- pnpm 11 fixado (`packageManager`), `allowBuilds` explícito, finais de linha LF
  (`.gitattributes` + `.editorconfig`), `.env.example`, recomendações do VS Code.
- `CLAUDE.md`, `AGENTS.md` (bloco gerenciado pelo Next), `README.md` com passo a passo para
  Windows, `docs/DECISIONS.md` (ADR-0001 a 0012), `docs/GLOSSARIO.md` (rascunho com 7 termos).
- CI no GitHub Actions rodando instalação, formatação, lint, tipos, testes, build e E2E no
  **Windows** e no Linux.

**Verificado:**

- Linux (sessão de nuvem): `pnpm install`, `pnpm check` (formatação, lint, tipos, 28 testes de
  unidade), `pnpm build` e `pnpm test:e2e` (2 testes) passando.
- **Windows** ([CI, execução nº 1](https://github.com/M4y-D4y-23h/from-scratch/actions/runs/37181731343),
  `windows-latest`, comandos no PowerShell 7): instalação sem compilar nada, formatação, lint,
  tipos, testes de unidade, `build` e os testes no navegador (que sobem o `pnpm dev` e abrem a
  página inicial) passaram. Linux também passou.

**Ficou de fora (de propósito):**

- Banco (SQLite + Drizzle), zod, catálogo, three.js, sharp e SDK da Anthropic: entram nas fases em
  que são usados (1, 2, 4 e 6), cada um com sua decisão registrada.
- Testes de componentes React (jsdom + Testing Library): só quando houver componente com lógica.
- Fonte personalizada (usamos a do sistema; ADR-0006).

**Problemas conhecidos / pontos de atenção:**

- ESLint 9 aparece como "não suportado" no npm (o ESLint 10 saiu em fev/2026), mas o
  `eslint-config-next` ainda depende de plugins que só suportam até o 9 (ADR-0001).
- A sessão de nuvem tem rede restrita (ver `CLAUDE.md`): `ui.shadcn.com`, `ardupilot.org`,
  `docs.qgroundcontrol.com`, `pnpm.io` e `gov.br` bloqueados. Pesquisas foram feitas pelo
  código-fonte das documentações no GitHub. **As fontes oficiais gov.br (ANAC, DECEA, Anatel)
  exigidas pela SPEC B.9 não puderam ser abertas daqui.**
- Na SPEC, a seção B.3 diz "Registre o `usage` de toda chamada (ver B.11)", mas o orçamento de API
  está na B.16. Assumido que a referência certa é a B.16.

**Revisão adversarial da Fase 0** (SPEC B.19.7):

- _O que faria um leigo se machucar?_ Nada nesta fase ensina montagem. A página não promete o
  que ainda não existe (aviso "Em construção") e lembra de conferir as regras vigentes.
- _O que faria o drone não voar?_ Ainda não há motor de cálculo. A pesquisa do Arquétipo 1
  (ADR-0013) já encontrou duas armadilhas que seriam erros na Fase 1: o `RTL_ALT` virou
  `RTL_ALT_M` (metros) no ArduCopter 4.7, e placas F4 de 1 MB podem não conseguir calibrar a
  bússola por falta de RAM.
- _O que estouraria o orçamento?_ Não há chamadas de API. O único custo novo é o CI no GitHub
  Actions (em repositório privado, minutos de Windows costumam consumir a cota mais rápido;
  ADR-0012).
- _O que quebraria no Windows?_ Coberto pelo CI no Windows e pelo teste que recusa scripts só de
  bash. Ponto residual: a política de execução do PowerShell, explicada no README.

**Dados do catálogo para você verificar:** nenhum ainda (o catálogo começa na Fase 1); revise
apenas os 7 verbetes de `docs/GLOSSARIO.md`.

---

## Fase 1: Domínio (plano, aguardando sua revisão)

**Objetivo (SPEC B.18):** tipos e schemas, banco + seed do catálogo, cálculos, compatibilidade,
solver, dificuldade, custos, locais e alertas determinísticos, começando pelo Arquétipo 1.
**Aceite:** testes geram os 3 builds de referência (3 faixas cada) com relatório completo; o
Arquétipo 1 valida UARTs (RC + GPS + telemetria), alimentação do vídeo e failsafe → RTL; testes
de falha cobrem TWR baixo, ESC subdimensionado, furação incompatível, hélice grande demais para
o frame, bateria com C-rating insuficiente e FC sem UARTs suficientes.

### Decisões que dependem de você

1. **Arquitetura do Arquétipo 1 (ADR-0013):** telemetria por Wi-Fi no drone como padrão e ELRS
   em modo MAVLink como alternativa? FC só com 2 MB ou mais (H7), ou aceitar F4 de 1 MB com alerta?
2. **Selo dos valores calculados:** proposta: todo número calculado (AUW, TWR, autonomia...) é no
   máximo ⚠️ _Estimativa_, e vira ❓ _Não verificado_ se alguma entrada for ❓. Como o seed nasce
   todo ❓ (SPEC B.6), os builds de referência sairão com cálculos ❓ até você verificar as peças.
3. **Fonte da verdade do catálogo:** proposta: arquivos JSON em `data/catalog/drone/` (versionados
   no git, cada verificação vira um diff revisável); o banco SQLite é reconstruído a partir deles
   (`pnpm db:seed`); a página /catalogo (Fase 3) grava no JSON e ressincroniza o banco. Projetos,
   versões, chat, uploads e uso ficam só no banco.
4. **Nomes no código:** proposta: entidades com os nomes em inglês da SPEC (`Component`,
   `ThrustData`, `BuildStepTemplate`...), campos em português `snake_case` como na SPEC
   (`massa_g`, `preco_estimado_brl`, `status_verificacao`...), funções em inglês (`computeAuw`).
5. **Pesquisa de datasheets e preços:** a rede da sessão de nuvem bloqueia muitos sites
   (fabricantes, lojas, gov.br). Itens sem fonte que eu consiga abrir ficam com o campo vazio e ❓,
   e o motor responde "sem dado" onde faltar (ex.: TWR sem tabela de empuxo). Opções: liberar
   domínios na configuração de rede do ambiente, ou você verificar depois no /catalogo.
6. **Textos regulatórios (ANAC, DECEA, Anatel):** a SPEC exige fonte oficial gov.br, que está
   bloqueada aqui. Proposta: os alertas entram com o texto marcado "a verificar" e sem link até a
   fonte ser aberta (por você ou com o domínio liberado).
7. **EPI extra:** incluir toalha grande, extintor e kit de primeiros socorros (recomendação da
   página de segurança do ArduPilot) além da lista da SPEC B.6?
8. **Honestidade sobre "montar vs. comprar pronto":** incluir uma nota fixa (sem preço inventado)
   de que drones prontos podem sair mais baratos e que o ganho de montar é aprender e
   personalizar, como a própria documentação do ArduPilot reconhece?

### Entregas, na ordem (cada item = commits pequenos com testes)

1. **Núcleo (`src/domain/core/`):** selo de verificação, faixa de preço em centavos com data,
   fonte, valor medido (valor + unidade + selo + fonte), `RuleResult`/`ValidationReport` (passou /
   falhou / sem dado; bloqueante; texto leigo; texto técnico; sugestão; fonte), tipos de
   dificuldade (9 domínios, níveis 0–5), custos, locais (🛒 🏠 🏭 🌳) e alertas.
2. **Schemas do drone (`categories/drone/schema.ts`, zod):** `Component` como união por categoria
   com specs tipadas. Ex.: frame (distância entre eixos, hélice máxima, furação dos motores e da
   stack); motor (estator, KV, células, furação, eixo); hélice (diâmetro, passo, pás, material);
   ESC (corrente contínua/pico, células, 4 em 1 ou individual); FC (placa no ArduPilot/Betaflight,
   flash, UARTs com DMA, saídas, BECs, furação); bateria (células, mAh, C, conector); rádio e
   receptor (protocolo, frequência, Wi-Fi/backpack); VTX, câmera e receptor de vídeo (sistema,
   tensão, corrente); GPS (bússola, conector); módulo de telemetria; módulo de energia. Mais
   `ThrustData`, `Tool`, `Archetype`, `BuildStepTemplate` e parâmetros de firmware versionados
   (nome, valor, unidade, versão mínima/máxima, fonte).
3. **Banco:** Drizzle ORM + `better-sqlite3` 13 (o pacote já traz o binário pronto para Windows
   x64/arm64, sem script de instalação e sem compilar; alternativa avaliada: `@libsql/client`).
   Tabelas da SPEC B.5, migrações com `drizzle-kit`, seed que valida cada JSON com zod antes de
   gravar, arquivo em `data/local/` (fora do git). Dependências novas, justificadas em ADR:
   `zod`, `drizzle-orm`, `better-sqlite3`, `drizzle-kit` e `tsx` (rodar scripts TypeScript no
   Windows). O CI no Windows prova a instalação.
4. **Cálculos (`calculations.ts`) + `config.ts`:** AUW com margem; empuxo por interpolação linear
   da curva (sem extrapolar: fora da tabela = "sem dado"); TWR com as faixas da SPEC; throttle de
   hover (alvo ~50%, segundo a página de segurança do ArduPilot); correntes máxima e de hover; ESC
   ≥ corrente × 1,2; bateria (Ah × C ≥ corrente × margem); tempo de voo como faixa. Toda constante
   com origem comentada e teste próprio, inclusive casos que devem falhar.
5. **Compatibilidade (`compatibility.ts`):** todas as regras da SPEC B.7, mais as do Arquétipo 1:
   UARTs suficientes conforme a opção de telemetria; UART do RC com DMA em F4/F7; BEC × consumo de
   VTX + câmera + GPS + receptor + telemetria (tensão e corrente com margem); bússola ≥ 100 mm de
   fios de potência e mastro; flash da FC; parâmetros de failsafe presentes (rádio → RTL, bateria
   → RTL, GCS); hélice de plástico para iniciante (aviso).
6. **Solver (`solver.ts`):** filtra combinações compatíveis, pontua por arquétipo (Arquétipo 1:
   facilidade e segurança > autonomia > custo) e gera econômica / equilibrada / premium, de forma
   determinística e com a explicação de cada escolha em dados (o LLM só reescreve na Fase 4).
   Inclui a comparação 450 mm × 5"–7" (TWR, hover, autonomia, espaço para montar, perigo da
   hélice, custo). **Os pesos do critério "mais fácil e seguro" vêm para você aprovar.**
7. **Dificuldade (`difficulty.ts`):** derivada dos passos e das peças; nota geral
   `0,6 × nível máximo + 0,4 × média ponderada pelas horas`, rótulos e horas totais; testada.
8. **Custos (`costs.ts`)**, **locais (`locations.ts`)** e **alertas (`safety.ts`)**: peças,
   ferramentas ("já tenho" tira do total), consumíveis, EPI e importação (parâmetro editável com
   data e aviso); 🛒 🏠 🏭 🌳 com requisitos; alertas obrigatórios da SPEC B.9 e os do Arquétipo 1
   (> 250 g, VTX e Anatel, RTL sem desvio de obstáculos, controle só pelo celular experimental,
   limitações do iPhone, simulador primeiro).
9. **Dados do Arquétipo 1:** catálogo para 3 faixas, tabelas de empuxo com fonte quando houver,
   ferramentas da SPEC B.6 (preços que você passou, ⚠️ out/2026) e 25–45 passos de montagem com
   domínios, riscos e checkpoints (calibrações, geofence, `RTL_ALT_M`, failsafes, teste de RTL
   baixo e em local aberto, conferir o home).
10. **Arquétipos 2 (FPV 5", Betaflight) e 3 (Tiny Whoop sub-250 g):** catálogo, passos e regras
    próprias (limite de 250 g, TWR alto no 5", alerta de simulador).
11. **Builds de referência:** testes que geram 3 arquétipos × 3 faixas com o relatório completo,
    mais os testes de falha do aceite.

**Sugestão de pausa no meio:** parar para sua revisão ao fim do item 9 (Arquétipo 1 completo),
antes de fazer os outros dois arquétipos.

**Fora da Fase 1:** 3D (Fase 2), painéis e /catalogo (Fase 3), LLM (Fase 4), guia navegável
(Fase 5), tutor e uploads (Fase 6), orçamento de API (Fase 7).

**Riscos conhecidos:** qualidade dos dados do seed (tudo nasce ❓); tabelas de empuxo podem faltar
para alguns pares motor + hélice; diferenças de parâmetros entre versões de firmware; rede
restrita para pesquisa.
