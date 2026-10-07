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

## Fase 1: Domínio (concluída em 2026-10-04, aguardando revisão)

**Aceite (SPEC B.18):** testes geram os 3 builds de referência (3 faixas cada) com relatório
completo; o Arquétipo 1 valida UARTs (RC + GPS + telemetria), alimentação do vídeo e
failsafe → RTL; testes de falha cobrem TWR baixo, ESC subdimensionado, furação incompatível,
hélice grande demais para o frame, bateria com C-rating insuficiente e FC sem UARTs suficientes.
**Tudo atendido** (`tests/unit/reference-a1.test.ts`, `tests/unit/reference-a2-a3.test.ts` e o
bloco "casos que devem falhar" de `src/domain/categories/drone/compatibility.test.ts`).

### Feito

- **Núcleo (`src/domain/core/`):** selos, faixas de preço em centavos com data, fontes, resultado
  de regra (passou / falhou / sem dado, bloqueante ou alerta, texto leigo e técnico, sugestão,
  fonte), dificuldade (9 domínios, níveis 0–5), locais, alertas, glossário e o cálculo de
  importação (câmbio + Remessa Conforme + ICMS "por dentro").
- **Drone (`src/domain/categories/drone/`):** schemas zod de 32 categorias de peça com specs
  tipadas; cálculos (peso com margem, empuxo pela tabela do fabricante, TWR, pairar, correntes,
  autonomia em faixa por estilo de voo); **35 regras** de compatibilidade e viabilidade; solver
  das três faixas com kits e explicação de cada escolha; custos; dificuldade (fórmula da SPEC
  B.8); "onde fazer"; alertas; perfis de parâmetros de firmware; comparação 450 mm × 5"; montar ×
  comprar pronto. Tudo puro (sem I/O), com as heurísticas em `config.ts` e a origem de cada uma.
- **Catálogo real (`data/catalog/drone/`):** 45 peças, 4 tabelas de empuxo, 25 ferramentas/EPI, 3
  arquétipos com 102 passos de montagem, 2 perfis de firmware (ArduCopter 4.7 e Betaflight 4.5) e
  5 drones prontos de referência. Cada peça com página oficial lida em 04/10/2026, preço da loja
  oficial em US$ e selo ❓ (ninguém conferiu ainda, SPEC B.6).
- **Banco local:** SQLite + Drizzle espelhando catálogo e glossário (`pnpm db:sync`), migrações
  `0000_inicial` e `0001_drones_prontos`.
- **Regras oficiais pesquisadas e citadas:** ANAC (Resolução nº 806/2026), DECEA (ICA
  100-40/2026), Anatel (Ato nº 14.448/2017), SAMU 192; ArduPilot, Betaflight e ExpressLRS
  conferidos no código-fonte (commits citados nos ADRs).
- **Docs:** ADR-0014 a ADR-0022, `docs/SPEC-ERRATA.md` (o que na SPEC estava desatualizado,
  como `RTL_ALT` → `RTL_ALT_M`), glossário com 42 termos.
- **`pnpm report`:** mostra os 9 builds no terminal (peças, números, custos, dificuldade, regras,
  alertas, montar × pronto e a comparação de tamanho).

**Resultado com o catálogo atual** (custos só das peças, faixa do cenário barato ao caro, sem
frete; ⚠️ estimativa):

| Arquétipo                 | Faixa       | Peso    | TWR  | Pairar | Voo         | Peças (R$)     | Dificuldade          |
| ------------------------- | ----------- | ------- | ---- | ------ | ----------- | -------------- | -------------------- |
| 1. GPS para filmar (450)  | econômica   | 1.607 g | 3,3  | 47%    | 8,5–12 min  | 6.182 a 7.971  | Avançado (2,75)      |
|                           | equilibrada | 1.613 g | 3,3  | 47%    | 8,4–11,9    | 8.240 a 10.337 | Avançado             |
|                           | premium     | 1.639 g | 3,25 | 47%    | 8,3–11,7    | 8.644 a 10.838 | Avançado             |
| 2. FPV 5" (Betaflight)    | econômica   | 736 g   | 9,2  | ≤ 50%  | 2,9–9,6 min | 4.213 a 6.101  | Avançado (2,8)       |
|                           | equilibrada | 737 g   | 9,1  | ≤ 50%  | 2,9–9,6     | 5.466 a 7.592  | Avançado             |
|                           | premium     | 737 g   | 9,1  | ≤ 50%  | 2,9–9,6     | 6.333 a 8.671  | Avançado             |
| 3. Tiny Whoop (sub-250 g) | econômica   | 26 g    | 4,4  | 40%    | 2,3–3,8 min | 2.236 a 3.389  | Intermediário (1,79) |
|                           | equilibrada | 34 g    | 5,6  | 33%    | 3,9–6,5     | 3.218 a 4.501  | Intermediário        |
|                           | premium     | 34 g    | 5,6  | 33%    | 3,9–6,5     | 3.781 a 5.118  | Intermediário        |

- **Comparação de tamanho (Arquétipo 1):** escolhe a classe 450 mm (nota 0,96 de 1). O 5" não
  atende (sem GPS com bússola e sem ArduPilot) e tem 3,2× a potência dos motores, 20% menos
  autonomia e metade do entre-eixos.
- **Montar × pronto:** o DJI Mini 4K Fly More (R$ 4,3–4,7 mil) e o kit RTF Meteor75 Pro II
  (R$ 1,9–2,2 mil) saem mais baratos que montar; no 5" e nos whoops BNF, com rádio, óculos e
  baterias, o preço fica parecido.

### Como testar

```powershell
pnpm install
pnpm check            # formatação, lint, tipos e os testes de unidade
pnpm report           # os 9 builds no terminal
pnpm report a1 --detalhes   # só o Arquétipo 1, com o motivo de cada escolha e as contas das regras
pnpm catalog:check    # confere o catálogo e o glossário
pnpm db:sync          # cria/atualiza o banco local em data/local/
```

Se você rodou `pnpm db:sync` antes desta fase, apague a pasta `data/local/` antes: a migração
inicial mudou durante a fase (antes de qualquer uso real).

Para mexer num número e ver o efeito: edite o JSON da peça em `data/catalog/drone/componentes/`
(ou um parâmetro em `config.ts`) e rode `pnpm report` de novo.

### Suas 8 decisões da revisão da Fase 0 (o que foi feito)

1. **Arquitetura do Arquétipo 1:** telemetria padrão = **ExpressLRS em modo MAVLink**, Wi-Fi no
   drone como alternativa (ADR-0017); FC só com **2 MB ou mais** (Pixhawk 6C / 6C Mini, H7).
   _Por quê:_ (a) a telemetria alcança todo o voo legal (300 m), não só os ~150 m do Wi-Fi do
   drone, e o mapa não congela no meio do voo; (b) menos peças e pontos de falha (sem placa ESP32
   para gravar, alimentar e afastar do GPS, uma UART a menos); (c) nada a mais para comprar; (d) a
   mesma segurança: conferi no código do ELRS e do ArduPilot que perder o link dispara o mesmo
   failsafe de rádio → RTL em ~1 s. FC de 1 MB foi excluída (regra bloqueante) porque o firmware
   reduzido pode não calibrar a bússola, e sem bússola não há retorno automático.
2. **Selos de valores calculados (ADR-0016):** comparação direta entre peças verificadas pode ser
   ✅; conta (TWR, autonomia, custo) nunca passa de ⚠️; qualquer entrada ❓ deixa o resultado ❓.
   Assim o app nunca parece mais certo do que os dados permitem.
3. **Catálogo (ADR-0015):** arquivos JSON versionados são a fonte da verdade; o banco é só um
   espelho. Cada correção que você fizer vira um diff revisável no git.
4. **Nomes e traduções (ADR-0022):** termos que você vai encontrar nos programas e lojas ficam em
   inglês (Failsafe, Frame, Stack...), sempre explicados; o glossário tem 42 termos e um teste
   impede jargão sem verbete.
5. **Pesquisa com a rede liberada:** specs e preços das páginas oficiais dos fabricantes, com link
   e data. Lojas brasileiras (Mercado Livre, Amazon) bloqueiam acesso automático, então o preço
   em R$ sai da loja oficial em US$ + o parâmetro de importação (ADR-0018).
6. **Regras oficiais:** ANAC, DECEA e Anatel lidas nos sites oficiais e citadas nos alertas. A
   pesquisa corrigiu a SPEC: até 250 g dispensa o cadastro na ANAC, mas não as regras do DECEA ao
   ar livre (`docs/SPEC-ERRATA.md`, item 1.3).
7. **EPI extra e segurança (ADR-0021):** toalha, extintor e kit de primeiros socorros como EPI
   essencial; três alertas novos em todo projeto (pessoas primeiro, ordem de ligar e desligar,
   e o que fazer se algo der errado, com o SAMU 192).
8. **Pronto pode sair mais barato (ADR-0021):** aviso fixo em todo projeto e comparação com 5
   drones prontos reais, com preço estimado em R$.

### Para você aprovar ou ajustar

1. **Pesos da comparação de tamanho** (`config.ts`, `comparacao_tamanho`): facilidade 0,3,
   segurança 0,3, autonomia 0,15, espaço para montar 0,1, custo 0,15.
2. **Whoop "Intermediário" (1,79):** com os limites da SPEC B.8, nenhum projeto com passo de nível
   2 chega a "Iniciante". Se você quiser o whoop como "Iniciante", o ajuste é nos limites dos
   rótulos (`config.ts`, `limites_rotulo`), não nos passos.
3. **Heurísticas sem fonte oficial** (em `config.ts`, conferidas com o tempo de voo publicado
   pelos fabricantes): corrente média ÷ corrente de pairar por estilo de voo (estável 1,0–1,25;
   freestyle 1,0–3,0; indoor 1,0–1,5) e horas de aprendizado por nível.

### Ficou de fora (de propósito)

- **Vídeo digital** (DJI O4, Walksnail, HDZero): é o padrão do mercado no 5", mas as lojas
  oficiais não publicam em texto tensão, consumo e peso do VTX digital. O premium do 5" ficou
  analógico, sem inventar números.
- **Um 5"–7" com GPS no catálogo:** a comparação de tamanho usa o FPV 5" do Arquétipo 2 como
  representante da classe (mesmo tamanho de hélice e motor).
- **Preços brasileiros:** sem fonte automática confiável; ficam para você preencher na página
  /catalogo (Fase 3). Sem preço pesquisado (fora dos totais, sempre listados): rabicho XT60,
  toalha, extintor, kit de primeiros socorros e chaves de precisão.
- **Outras stacks 20 x 20** para o 5": só a iFlight BLITZ Mini ATF435 tem ficha completa publicada
  (BEC incluído).
- 3D (Fase 2), painéis e /catalogo (Fase 3), LLM (Fase 4), guia navegável (Fase 5), tutor e
  uploads (Fase 6), orçamento de API (Fase 7).

### Problemas conhecidos / pontos de atenção

- Tudo no catálogo é ❓ até você conferir; por isso os números saem ❓ (ADR-0016).
- Disponibilidade muda: em 04/10/2026 os óculos BETAFPV VR04 estavam sem estoque na loja oficial.
- O nome do alvo Betaflight da stack (IFLIGHT_BLITZ_F435) foi conferido no repositório oficial de
  configurações; a iFlight chama a placa de "ATF435". Confira na hora de gravar o firmware.
- A AIO BETAFPV Matrix 1S sai com giroscópios diferentes conforme o lote (a configuração oficial
  lista ICM42688P, ICM42622P, BMI270 e LSM6DSK320X); todos são suportados pelo mesmo alvo.
- Pico de corrente do Arquétipo 1 (~66 A com tudo no máximo) passa do limite contínuo do conector
  do módulo de energia PM02 V3 (30 A): o app avisa (alerta, não bloqueia), porque pairando o
  drone usa ~13 A.

### Revisão adversarial da Fase 1 (SPEC B.19.7)

Feita sobre os 9 builds (`pnpm report`), os 102 passos, os alertas e os perfis de firmware. O que
apareceu e o que foi feito:

- _O que machucaria um leigo?_
  - **Corrigido:** no 450 mm, a bateria era ligada pela primeira vez na calibração dos ESCs,
    depois de soldar o receptor e de ligar o vídeo direto na bateria, sem repetir a medição de
    curto (o teste vinha antes dessas soldas). Novo passo "Primeira ligação com bateria, sem
    hélices" (mede de novo e liga pelo smoke stopper); no 5", a primeira ligação também mede de
    novo.
  - **Corrigido:** o 450 mm e o 5" não ensinavam a carregar a LiPo (só o whoop ensinava). Novo
    passo bloqueante "Carregar a bateria pela primeira vez": LiPo, número de células, 1C,
    conector de balanceamento, bolsa anti-chamas e alguém olhando.
  - **Corrigido:** o failsafe do Betaflight para os motores, então o drone cai onde estiver. O
    passo do teste agora diz isso e manda não voar sobre pessoas, carros ou casas.
  - Conferido: hélices só no local de voo, depois dos testes de direção dos motores e de
    failsafe na bancada (checkpoints bloqueantes nos 3 guias); antena antes da primeira ligação;
    RTL testado baixo e perto; alertas de LiPo, solda, hélices e regras em todo projeto.
- _O que faria o drone não voar?_
  - **Corrigido:** o 5" não tinha capacitor. A caixa da stack não traz um (conferido na lista da
    iFlight), e em 6S os picos de tensão podem queimar a ESC. Entrou um capacitor de baixa ESR
    (~1000 µF, como recomenda o Betaflight), com passo de solda e polaridade.
  - **Corrigido:** os ajustes do Betaflight para LiHV e DShot bidirecional dependiam do id da peça;
    agora dependem da química da bateria e do firmware do ESC.
  - **Corrigido:** o pareamento do 450 mm não falava da versão do ExpressLRS. O modo MAVLink exige
    3.5.0 ou mais novo no rádio e no receptor e 1.5.0 no TX Backpack (documentação do ELRS).
  - Conferido: TWR, pairar, C-rating, corrente do ESC, BEC e UARTs nos 9 builds; o único aviso é o
    pico de corrente do PM02 V3, aceito (pairando, ~13 A).
  - **Pendente:** as taxas de telemetria (`MAVn_*`) do modo MAVLink do ELRS. Afetam a fluidez da
    telemetria no celular, não o voo. O passo avisa, e os valores entram no perfil depois de
    conferir no código da 4.7 qual `MAVn` corresponde à porta do receptor.
- _O que estouraria o orçamento?_
  - **Corrigido:** o simulador era "recomendado" (fora do total), mas o treino nele é passo
    obrigatório nos 3 guias. Agora é essencial (+R$ 30–100; errata 2.3).
  - **Corrigido (latente):** reservas além do que vem num kit sumiriam do custo; agora são
    compradas à parte (hoje nenhum slot pede isso: o kit do X500 já traz 6 hélices, 2 de reserva).
  - Sempre avisado: frete, IOF e spread do cartão ficam fora; itens sem preço pesquisado aparecem à
    parte (rabicho XT60, capacitor, toalha, extintor, kit de primeiros socorros, chaves de precisão).
- _O que quebraria no Windows?_ `pnpm report` usa `tsx` e `path.resolve`, sem sintaxe de bash; o CI
  roda no Windows a cada envio.

**Dados do catálogo para você verificar** (o que mais mexe nos números e na segurança): tabelas de
empuxo (T-MOTOR AIR2216 II + T1045 II a 16 V; iFlight XING2 2207 1855KV + Gemfan 51466 a 24 V;
BETAFPV 0702/0802 1S), massa e C das baterias (CNHL 4S 3300 30C, MiniStar 6S 1500 120C, LAVA II
320/480), BEC e UARTs das controladoras (Pixhawk 6C/6C Mini, BLITZ Mini ATF435, Matrix 1S), limite
de 30 A do conector do PM02 V3, encaixe da bateria e da hélice nos frames Air65 II/Air75 II, altura
do suporte de GPS do X500 (108 mm, medida no CAD) e os preços de 04/10/2026 com o câmbio de
02/10/2026.

---

## Fase 2: Visualizador 3D (concluída em 2026-10-05, aguardando revisão)

**Aceite (SPEC B.18):** trocar a hélice de 5" para 3" ou o frame altera o modelo; o Playwright
tira screenshots dos 3 arquétipos. **Atendido:** `src/domain/categories/drone/scene.test.ts`
(hélice 5" → 3" e troca de frame mudam disco, braços, motores e medidas) e
`tests/e2e/viewer3d.spec.ts` (screenshot de cada arquétipo; trocar a hélice no "experimentar"
muda os pixels do desenho). No CI, os screenshots ficam no artefato `screenshots-3d-<sistema>`.

### Feito

- **Scene graph no domínio (`scene.ts`, ADR-0023):** o build vira um JSON em milímetros reais:
  frame pela geometria e entre-eixos (placas, braços, dutos do whoop, trem de pouso do X500),
  motores, hélices com diâmetro e número de pás, stack com os espaçadores na furação real, FC,
  bateria com strap, câmera, VTX, receptor e antenas, GPS no mastro, PDB, módulo de energia, XT60 e
  capacitor; fiação simplificada; vista explodida; medidas; frente. Número e sentido de giro dos
  motores conferidos no código do ArduPilot e na documentação do Betaflight.
- **Visualizador (`src/components/viewer3d`):** girar e aproximar; vista explodida; clique numa
  peça (ou na lista, pelo teclado) abre o painel com função, selo, quantidade, preço com data, massa
  e termos de busca; medidas; fiação; setas de giro numeradas; seta da frente; legenda; destaque
  das peças de um passo do guia; "experimentar" hélice e frame (só o desenho, com aviso).
- **Páginas:** `/3d/[arquetipo]/[faixa]` (as 9 geradas no build), `/3d` e links na página inicial.
- **Dados:** medidas oficiais da bateria CNHL 4S (136 x 44 x 30 mm); campos de desenho do frame
  (placa central, espaço entre placas, trem de pouso, espessura da placa, straps que vêm na caixa);
  2 termos novos no glossário (Entre-eixos, DeadCat).
- **Testes:** 19 de unidade da cena (13 com peças sintéticas, 6 com o catálogo real) e 6 no
  navegador.

### Como testar

```powershell
pnpm dev        # depois abra http://localhost:3000 e clique num dos "Drones de referência em 3D"
pnpm test:e2e   # os screenshots ficam em test-results\...\3d-<arquétipo>.png
```

No 3D: arraste para girar, use a roda do mouse para aproximar, mova a "Vista explodida", clique
numa peça, escolha um passo em "Destacar as peças do passo" e, em "Experimentar", troque a hélice
para 3".

### Ficou de fora (de propósito)

- Modelos GLB de peças reais, exportar STL/DXF e a "ilustração artística" por API (a SPEC B.11 põe
  como futuro ou opcional).
- Posição real dos motores em frames DeadCat e stretch-X: o fabricante não publica as
  coordenadas; o 3D desenha como X a partir do entre-eixos e avisa.
- Troca de peça com revalidação, peso e custos: Fase 3. O "experimentar" só redesenha.
- Girar o 3D pelo teclado: a lista de peças e o painel dão o mesmo conteúdo pelo teclado.

### Problemas conhecidos

- O console mostra "THREE.Clock: This module has been deprecated", vindo de dentro do
  @react-three/fiber 9.8 com o three 0.186. É só aviso; some quando sair uma versão nova.
- Formas aproximadas (sino do motor, placas, antenas, canopy, PM02, XT60, capacitor) dizem por
  quê no painel da peça.

### Revisão adversarial da Fase 2 (SPEC B.19.7)

- _O que machucaria um leigo?_
  - **Corrigido:** as pás eram desenhadas com uma inclinação decorativa, e alguém poderia usá-la
    para decidir o lado de montar a hélice. Agora as pás são planas; o sentido de giro fica nas
    setas e no rótulo, e o guia manda conferir a marcação da própria hélice.
  - Conferido: número e sentido dos motores iguais aos do firmware (código-fonte do ArduPilot e
    documentação do Betaflight, padrão "props in", que é o dos guias). O "experimentar" avisa que
    nada foi revalidado. O strap da bateria diz se vem com o frame ou se é preciso conferir.
- _O que faria o drone não voar?_ Nada: nenhum cálculo usa a cena, e o motor de cálculo não mudou.
- _O que estouraria o orçamento?_ Nada muda nos custos. O strap que não está na lista de peças é
  avisado no painel ("confira se o frame ou a bateria trazem").
- _O que quebraria no Windows?_ Nenhuma dependência nativa nova (nada em `allowBuilds`); o CI no
  Windows roda os testes do 3D com WebGL por software (SwiftShader).
- _Desempenho:_ o 3D só desenha quando algo muda; cerca de 50 objetos simples por drone; nada é
  baixado da internet.

**Dados do catálogo para você verificar:** placa central de 144 mm, espaço de 28 mm entre placas e
trem de pouso de 215 mm do X500 V2 (das notas da Holybro); bateria CNHL 4S 3300 de 136 x 44 x 30
mm; Nazgul Evoque F5 V3 com placas de 3 mm e 2 straps; motor XING2 2207 de 29,08 x 32,6 mm.

---

## Fase 3: Painéis e catálogo (concluída em 2026-10-05, aguardando revisão)

**Aceite (SPEC B.18):** "consigo abrir um build de referência e ver custos, dificuldade, locais,
alertas e cálculos, e trocar uma peça com revalidação", sem LLM. **Atendido:**
`tests/e2e/project.spec.ts` (as 6 abas, com screenshot de cada uma; trocar a FC cria o projeto
com a versão 2 recalculada; histórico e "voltar para esta versão"; a troca combinada do whoop) e
`tests/unit/swap-reference.test.ts` (com o catálogo real: os 9 builds voltam iguais a partir da
escolha, troca compatível e incompatível, sugestão combinada). A página /catalogo (SPEC B.6) está
em `tests/e2e/catalog.spec.ts`. No CI, os screenshots ficam no artefato `screenshots-<sistema>`.

### Feito

- **Página do projeto** (`/referencia/[arquetipo]/[faixa]` e `/projetos/[id]`), no layout da SPEC
  B.12: resumo à esquerda (status, peso, TWR, pairar, tempo de voo, custo, dificuldade e horas), 3D
  no centro (fixo ao rolar) e abas à direita; no celular, resumo → 3D → abas. A aba aberta fica no
  endereço (`?aba=calculos`).
- **As 6 abas:**
  - _Peças e Custos:_ totais de peças, ferramentas, consumíveis e EPI, importação estimada e total
    geral (com quantos itens ficaram sem preço); lista agrupada com selo, preço com data, links de
    **busca** (Mercado Livre e AliExpress), "Trocar" e "Ver no 3D"; ferramentas com "já tenho";
    montar × comprar pronto.
  - _Dificuldade:_ nota geral, barra por área, o que se aprende fazendo e os riscos de cada área.
  - _Onde fazer:_ comprar pronto, em casa, serviço externo e espaço aberto, com requisitos, tempo,
    ferramentas e o que comprar onde.
  - _Montagem:_ prévia do passo a passo (objetivo, por que importa, como saber que deu certo, erros
    comuns) e os parâmetros do firmware. O guia interativo é a Fase 5.
  - _Segurança:_ todos os alertas, do perigo às boas práticas, com o que fazer e as fontes.
  - _Cálculos:_ massa, TWR (com régua), pairar, autonomia, alimentação, as regras com a explicação
    leiga e a técnica, e a comparação 450 mm × 5" (Arquétipo 1).
- **Trocar peça com revalidação (ADR-0024):** só aparecem as alternativas que passam nas regras, com
  a diferença de custo, peso, TWR, pairar e autonomia. As que não servem aparecem com o motivo e,
  quando dá, com a troca combinada que resolve (no whoop: frame + hélices + motores). Num build de
  referência, a troca cria o seu projeto; num projeto, vira uma versão nova.
- **Projetos com versões:** histórico com "ver" e "voltar para esta versão" (que vira uma versão
  nova), renomear e apagar. Aviso quando o catálogo mudou desde a versão.
- **Glossário em toda a interface:** termos sublinhados com balão (mouse, toque e teclado) e a
  página `/glossario`. Verbete novo "Receptor de vídeo" (agora são 45).
- **Catálogo (`/catalogo`, ADR-0025):** busca e filtros (tipo, categoria, selo e drone); página de
  cada item com "usado em" (quais builds usam); marcar como verificado com fonte; preço em R$ ou
  US$ com data; editor de JSON com validação do catálogo inteiro; `/catalogo/importacao` (câmbio e
  impostos, com data). As mudanças vão para os JSON em `data/catalog/drone/`, no formato canônico
  (`pnpm catalog:format`).
- **Página inicial:** os três drones de referência (números da faixa econômica) e os seus projetos.
- **Segurança local:** `pnpm dev` e `pnpm start` só em 127.0.0.1; gravações só do próprio
  computador.
- **Testes:** 346 de unidade (eram 284) e 20 no navegador (eram 6), num servidor isolado, com cópia
  do catálogo e banco temporário: os testes não mexem nos seus arquivos nem nos seus projetos.

### Como testar

```powershell
git pull
pnpm install
pnpm dev        # abra http://localhost:3000 (ou http://127.0.0.1:3000)
pnpm check      # formatação, lint, tipos e testes de unidade
pnpm test:e2e   # testes no navegador, num servidor separado (porta 3100)
```

Roteiro no navegador:

1. Na página inicial, abra "Drone com GPS para filmar e aprender" → **Econômica** e passe por todas
   as abas. Passe o mouse num termo sublinhado (por exemplo, "LiPo" na aba Segurança).
2. Em **Peças e Custos**, clique em "Trocar" na Controladora de voo (FC) e escolha outra: o app cria
   "Meu projeto: ...", com a versão 2 e tudo recalculado. Em "Versões" (abaixo do resumo), veja a
   versão 1 e volte para ela.
3. No **Tiny Whoop** (Econômica), clique em "Trocar" no frame: nenhuma peça serve sozinha, e o app
   sugere a troca combinada.
4. Marque "Já tenho" numa ferramenta e veja o total de ferramentas cair (vale para todos os
   projetos; desmarque depois).
5. Em **Catálogo**, busque "pixhawk"; abra o "Rabicho XT60", salve um preço com data e veja o FPV
   5" passar a incluí-lo no total.

**Atenção:** o que você salva em /catalogo muda os arquivos de verdade em `data/catalog/drone/`.
Veja a mudança com `git diff`; se foi só um teste, desfaça com `git checkout -- data/catalog`.

### Para você decidir

1. **Lojas dos links de busca:** hoje Mercado Livre (loja nacional e ferramentas) e AliExpress
   (importação). Quer outras (Amazon, lojas brasileiras de FPV)? O formato da busca de cada uma
   precisa ser conferido antes.
2. **"Já tenho" vale para todos os projetos** (é a sua bancada). Se preferir por projeto, é uma
   mudança pequena.

### Ficou de fora (de propósito)

- Pedido em linguagem natural e LLM (Fase 4), guia interativo com checkpoints (Fase 5) e tutor
  (Fase 6). A aba Montagem é uma prévia.
- Criar item novo no catálogo pela página: é pelo JSON no editor de texto, validado com
  `pnpm catalog:check`.
- Mudar as opções do projeto pela página (Android ou iPhone, tipo de uso, óculos): os projetos usam
  as opções do drone de referência.
- Links da Amazon: a busca não pôde ser conferida daqui (verificação de robô).
- Gravar a partir de outro aparelho da rede: bloqueado de propósito.
- Versão "congelada": uma versão antiga é recalculada com o catálogo atual (a página avisa quando
  o catálogo mudou).

### Problemas conhecidos

- O console mostra "THREE.Clock: This module has been deprecated" (Fase 2) e, só no `pnpm dev`,
  "Encountered a script tag while rendering React component" (do next-themes, que põe o script do
  tema claro/escuro na página). São só avisos.
- Montar a página revalida as alternativas de todos os slots: de 0,1 a 0,5 s no servidor por
  build (o Arquétipo 1 é o mais lento).

### Revisão adversarial da Fase 3 (SPEC B.19.7)

- _O que machucaria um leigo?_
  - **Corrigido:** o balão de "Receptor" (o do rádio) aparecia também em "receptor de vídeo" e
    "receptor USB/OTG", com a explicação errada. Agora há o verbete "Receptor de vídeo", e um
    verbete pode dizer antes de que palavras não ser sublinhado.
  - Conferido: os links abrem uma busca, nunca um anúncio, com o aviso "confira se o anúncio é do
    modelo exato"; peça que só vem dentro de outra não aparece como opção de compra; a cada troca,
    os alertas são refeitos, e o diálogo mostra antes o "novo aviso" e o aviso que some.
- _O que faria o drone não voar?_
  - Toda troca passa por todas as regras do motor de cálculo no servidor, e troca que deixa falha
    bloqueante é recusada, mesmo se alguém chamar o servidor direto. Regra bloqueante sem dado aparece com ❓ ("sem dado
    para confirmar").
  - "Voltar para esta versão" não é recusado: se o catálogo mudou e a versão antiga agora falha numa
    regra, o projeto aparece "Bloqueado", com o motivo (mostrar em vez de esconder).
  - O editor de JSON valida o catálogo inteiro, mas não sabe se o número digitado é verdadeiro: um
    valor errado num item ✅ continua ✅. Revise o `git diff` antes do commit.
- _O que estouraria o orçamento?_
  - **Corrigido:** o total não dizia que itens sem preço ficaram de fora (extintor, kit de
    primeiros socorros e toalha; no FPV 5" também o rabicho XT60 e o capacitor). Agora o total
    geral, o resumo e os cartões da página inicial mostram "+ N itens sem preço".
  - O imposto de importação aparece estimado à parte (II + ICMS, do cenário mais barato ao mais
    caro), com o aviso de que frete, IOF e spread do cartão não estão incluídos.
  - "Já tenho" só tira do custo o que você marcou.
- _O que quebraria no Windows?_
  - **Corrigido:** gravar no catálogo com o arquivo preso pelo antivírus ou pelo indexador falhava
    de primeira; agora tenta de novo por até ~3 s e, se não der, explica sem deixar arquivo
    temporário.
  - Scripts novos em `.mjs`/`.ts` com `path`; `-H 127.0.0.1` funciona igual no Windows; o CI roda
    os testes de unidade e de navegador no Windows.
- _Segurança do app:_ gravações só do próprio computador (cabeçalho Host), servidor só em
  127.0.0.1 e entradas validadas com zod no servidor. Nenhum segredo novo.

**Dados do catálogo para você verificar:** preços dos itens ainda sem preço (toalha, extintor de
incêndio, kit de primeiros socorros, rabicho XT60 e capacitor), que dá para salvar em /catalogo; o
câmbio de 02/10/2026 e as regras do imposto de importação em /catalogo/importacao; e os nomes de
cada slot ("rotulo" nos arquétipos), que agora aparecem na lista de peças.

## Entre as fases 3 e 4: pedidos do dono (2026-10-07)

- **Desempenho (ADR-0026):** contas do motor guardadas na memória do servidor, abas desenhadas no
  navegador e mantidas abertas, um balão de glossário por página e a versão rápida para usar o app
  (`pnpm app` e o F5 padrão). Medido no modo de desenvolvimento: página do Arquétipo 1 de 2,3 s
  para 0,2 s; trocar de aba de 0,2–1 s para 0,02–0,14 s.
- **"Esconder as ferramentas do Next" (dev tools):** vale até reiniciar o `pnpm dev` (ou um dia); o
  README explica como voltar. Na versão rápida o botão não aparece.
- **Catálogo com abas:** Peças, Drones prontos, Ferramentas e EPI e Tabelas de empuxo, com filtros
  que respondem enquanto você digita.

## Fase 4: Pipeline com LLM (concluída em 2026-10-07; o dono liberou a Fase 5 em 2026-10-07)

**Aceite (SPEC B.18):** "B.10 completo, com perguntas clicáveis e 2–3 opções; evals 1–12 passam
nos critérios."

- **Modo simples (sem IA): 13 de 13 casos passam** (`tests/unit/evals-simples.test.ts`, que roda no
  `pnpm check` e no CI, e `pnpm evals --simples`).
- **Com o Claude: ainda não rodado.** O contêiner desta sessão não tem chave da API, e nenhuma
  chamada paga foi feita. Rode `pnpm evals` no seu computador: ele mostra antes o custo estimado
  (hoje, de US$ 0,38 a US$ 3,03 pelos 13 casos) e pede confirmação. O cliente da API foi testado
  com respostas simuladas: recusa, fallback de modelo, JSON inválido, resposta cortada, custo por
  modelo e memória.

### Feito

- **Página `/novo` (e o campo na página inicial):** você descreve o drone com as suas palavras. O
  app:
  1. recusa o que é perigoso (armas, químicos, bloqueadores, vigilância, esconder das
     autoridades), com explicação e uma alternativa;
  2. pergunta só o que falta (até 5 perguntas, com opções clicáveis);
  3. escolhe o tipo de drone pelas regras e explica o porquê;
  4. mostra até 3 opções (econômica, equilibrada, premium) com custo com e sem ferramentas, peso,
     TWR, tempo de voo, dificuldade, se cabe no orçamento e os avisos de cada uma;
  5. mostra os alertas do que você pediu (voar longe, perto de pessoas, uso comercial, controle só
     pelo celular, iPhone) e as suposições ("dá para mudar").
- **Pedido impossível:** explicação com os números do motor de cálculo e a opção viável mais
  próxima. Exemplos: carga (empuxo e peso do drone mais forte do catálogo), autonomia (o que voa
  mais tempo) e orçamento (o mais barato que cabe, ou o mais barato de todos).
- **Escolher uma opção cria o projeto** (versão 1, com o pedido, a intenção, as respostas e as
  opções mostradas). A página do projeto mostra "Seu pedido".
- **Onde a IA entra (ADR-0027):** uma chamada lê o pedido (segurança + intenção, saída estruturada
  validada com zod) e outra explica a escolha. A explicação só é aceita sem nenhum número; os
  números ficam nos cartões, vindos do motor.
  - Fallback de recusa no servidor; custo de cada chamada gravado em `uso_api`; registro de
    segurança em `eventos_seguranca`.
  - A leitura fica na memória: responder às perguntas e criar o projeto não pagam outra chamada.
- **Modo simples:** sem chave da API, o pedido é lido por palavras-chave, e a página avisa. Se a
  API falhar, o app cai nesse modo com um aviso, e enviar de novo tenta a IA outra vez.
- **Testes:** 434 de unidade (eram 362) e 24 no navegador (eram 20). Os testes no navegador forçam
  o modo simples e nunca chamam a API.

### Como testar

```powershell
git pull
pnpm install
pnpm dev                 # ou F5 / pnpm app; abra http://localhost:3000
pnpm check               # inclui os 13 evals no modo simples
pnpm evals --simples     # os evals no terminal, sem custo
```

Com a IA (opcional; cada pedido custa uma chamada à API):

```powershell
Copy-Item .env.example .env.local   # se ainda não existir
notepad .env.local                  # cole a chave em ANTHROPIC_API_KEY=
pnpm dev                            # reinicie o app para ler a chave
pnpm evals                          # mostra o custo estimado e pergunta antes
```

Roteiro no navegador:

1. Na página inicial, escreva "quero um drone" e clique em **Montar meu projeto**. Responda às 3
   perguntas e veja as opções; abra "Riscos e regras" e "O que assumimos".
2. Clique num exemplo ("drone simples com GPS... controle pelo celular"). Escolha "Só pelo
   celular (experimental)" e veja o alerta de perigo aparecer.
3. Teste "drone que carregue 20 kg por R$ 500" (impossível, com números) e "drone com câmera para
   vigiar minha vizinha" (recusado).
4. Escolha uma opção: o projeto abre com tudo calculado e "Seu pedido" na lateral.

### Para você decidir

1. **Rodar `pnpm evals` com a sua chave** e me mandar o relatório (`data/local/evals/`) se algum
   caso falhar. Esse é o último passo do aceite.
2. **Dificuldade do Tiny Whoop:** a SPEC espera "dificuldade baixa" no caso 1, mas o motor dá
   "Intermediário" (nota 1,79; é a menor do catálogo: FPV 2,8 e GPS 2,75). Hoje o eval confere
   "a menor do catálogo". Quer mudar as faixas dos rótulos (ADR-0019) para o whoop aparecer como
   "Iniciante"?
3. **Esforço da explicação:** `high` (a SPEC B.3 pede alto para a geração do projeto). Leva mais
   tempo e custa mais que `medium`; enquanto isso, a tela já mostra os motivos das regras. Manter?
4. **Modo simples sem a camada 2 de segurança:** sem chave, só o pré-filtro protege. O projeto que
   sai é sempre um drone do catálogo, sem nada de perigoso. Aceita assim?

### Ficou de fora (de propósito)

- A IA reescrevendo a linguagem dos passos (B.10, passo 7): fica para a Fase 5, com o guia de
  montagem.
- Mudar Android/iPhone, tipo de controle ou uso depois de criar o projeto: por enquanto, faça outro
  pedido.
- Limite de gasto com a API (B.16): Fase 7. O custo já fica registrado em `uso_api`.
- Conversa livre com a IA: o tutor é a Fase 6.

### Problemas conhecidos

- A leitura pela IA não foi testada com o modelo de verdade nesta sessão (veja o aceite acima).
- O modo simples entende pedidos diretos ("até R$ 2.000", "1 hora de voo", "dentro de casa"); frases
  livres, gírias e negações ("não quero GPS") precisam da IA.
- A explicação pela IA aparece alguns segundos depois das opções (esforço alto).
- A primeira análise depois de abrir o app calcula os 9 builds; as próximas usam a memória.

### Revisão adversarial da Fase 4 (SPEC B.19.7)

- _O que machucaria um leigo?_
  - **Corrigido:** o pré-filtro deixava passar "atirar com chumbinho" e bloqueava "bomba de água".
    Os padrões foram ajustados, com testes dos dois lados.
  - **Corrigido:** a explicação da IA agora também passa pelo pré-filtro (um pedido que tentasse
    desviar o texto cai nos motivos das regras).
  - Categoria proibida bloqueia mesmo se a classificação disser "permitido"; objetivo ambíguo faz
    perguntar o objetivo antes de mostrar qualquer projeto. Pedidos com riscos (longe, perto de
    pessoas, comercial) mostram os alertas em destaque, com as fontes.
  - Recusa do próprio modelo vira bloqueio com explicação. Nenhum texto livre da IA aparece além
    da explicação conferida.
- _O que faria o drone não voar?_ As opções saem do solver com todas as regras bloqueantes
  conferidas; opção bloqueada não pode ser escolhida; o projeto é recalculado no servidor ao ser
  criado, nunca a partir do que o navegador mandou. Controle só pelo celular aparece como
  experimental, com alerta de perigo e a regra de aviso.
- _O que estouraria o orçamento?_
  - **Corrigido:** a pergunta de orçamento oferecia "Até R$ 1.000", mas nenhum projeto do catálogo
    custa tão pouco. As faixas agora são R$ 3.000, 6.000 e 10.000, e a ajuda diz quanto custa hoje
    o projeto mais barato (calculado pelo motor).
  - **Corrigido:** o aviso de itens sem preço aparecia duas vezes no cartão.
  - O orçamento é conferido com o total com ferramentas (ou só as peças, se você disser); "pode
    caber" quando só os preços mais baixos cabem; itens sem preço aparecem como "+ N sem preço".
  - Custo da API: só por POST e só do próprio computador; link não dispara chamada; memória
    evita pagar duas vezes pelo mesmo pedido; os evals mostram o custo antes e pedem confirmação.
- _Privacidade:_ a página avisa que o texto do pedido vai para a API da Anthropic. A chave fica só
  no `.env.local`.

**Dados para você verificar:** os preços da API em `src/server/llm/config.ts` (conferidos em
07/10/2026; confira em anthropic.com/pricing), o câmbio do catálogo (usado no custo em R$) e,
como antes, os preços dos itens sem preço. As faixas de orçamento das perguntas foram escolhidas
pelos preços atuais do catálogo.

## Fase 5: Guia de montagem (concluída em 2026-10-07, aguardando revisão)

**Aceite (SPEC B.18):** "percorro um projeto do passo 1 ao final, com o progresso salvo".
**Atendido:** `tests/e2e/guide.spec.ts` começa a montar o Tiny Whoop a partir do drone de
referência, confirma os 5 checklists de segurança, marca os 26 passos, recarrega a página no meio
(o progresso e o passo onde parou continuam lá) e termina com "Guia concluído!". No banco,
`src/server/guide/service.test.ts` faz o mesmo e confere as recusas.

As decisões pendentes da Fase 4 (rótulo de dificuldade do whoop, esforço da explicação e modo
simples sem a camada 2) ficaram como estavam, já que o dono liberou a fase seguinte sem pedir
mudança.

### Feito

- **A aba Montagem é o guia (SPEC B.13):**
  - progresso (X de N passos, %, tempo que falta) e "Continuar de onde parei";
  - um passo por vez: objetivo, por que importa, peças deste build (com quantidade), ferramentas,
    parâmetros do firmware do passo com o valor do projeto, como saber que deu certo, erros
    comuns, riscos, alertas, nível exigido por área e as fontes;
  - lista de todos os passos (feito, pendente, checklist, opcional), anterior/próximo e o passo
    no endereço (`?passo=`), para voltar e compartilhar.
- **Checkpoints de segurança (SPEC B.9, ADR-0028):** o checklist é marcado item por item e
  confirmado antes de fazer o passo crítico. Nenhum passo depois de um crítico pendente pode ser
  marcado, e o passo bloqueado leva até o que falta. Desfazer apaga a confirmação. Tudo é
  conferido no servidor.
- **Trocar uma peça reabre os passos que usam aquela peça** (primeira ligação, sentido dos
  motores, failsafe...), com aviso na mensagem da troca.
- **3D:** as peças do passo aberto ficam destacadas no modelo, sem rolar a tela; a lista
  "Destacar as peças do passo" usa a mesma numeração do guia.
- **Drones de referência:** guia só para leitura e o botão "Começar a montar", que cria o seu
  projeto e abre o guia. Versões antigas também são só leitura.
- **Progresso** no marcador da aba (12/25, ao vivo) e na lista de projetos da página inicial.
- **Botão "Perguntar ao tutor sobre este passo"** desativado, com o aviso de que chega na Fase 6.
- **Testes:** 476 de unidade (eram 434), incluindo a integridade dos 9 guias com o catálogo real
  (toda peça, ferramenta, parâmetro e alerta citado existe no projeto) e as regras dos
  checkpoints; no navegador, 26 (eram 24).

### Como testar

```powershell
git pull
pnpm install
pnpm app        # ou F5; abra http://localhost:3000
pnpm check
pnpm test:e2e
```

Roteiro no navegador:

1. Abra um drone de referência (ex.: Tiny Whoop → Econômica) → aba **Montagem**: o guia aparece
   só para leitura. Clique em **Começar a montar**.
2. Vá marcando "Feito, ir para o próximo". No passo 11 ("Primeira ligação, sem hélices") o botão
   fica desativado até você marcar os 3 itens do checklist e clicar em **Confirmar o checklist**.
3. Na lista "Todos os passos", abra "Instalar as hélices": ele avisa que falta o passo 11 e
   leva até ele.
4. Feche o navegador e abra o projeto de novo (pela página inicial): o progresso e o passo onde
   você parou continuam lá.
5. Troque uma peça (ex.: os motores, na aba Peças e Custos): a mensagem diz quantos passos do guia
   voltaram a pendente.

### Para você decidir

1. **Portões nos passos críticos:** hoje, nenhum passo depois de um crítico pendente pode ser
   marcado (ler adiante é livre). É rígido de propósito (segurança primeiro). Prefere que só os
   próprios passos críticos exijam o checklist, sem travar os seguintes?
2. **A IA personalizar a linguagem dos passos** (SPEC B.10, passo 7): deixei para a Fase 6, junto
   do tutor. Os textos do catálogo já são para leigos e têm fonte. Concorda?

### Ficou de fora (de propósito)

- Tutor por chat e fotos (Fase 6): o botão do passo está desativado.
- Personalizar a linguagem dos passos com a IA (veja acima).
- Anotações e fotos por passo, e o "quanto tempo levei" de cada um.
- Animação de montagem no 3D (o destaque mostra as peças, não o movimento).

### Problemas conhecidos

- Marcar os itens do checklist não prova que a pessoa conferiu: é um lembrete obrigatório.
- Passo que sai do guia por uma troca de peça (ex.: telemetria por Wi-Fi) mantém o progresso
  guardado, mas não conta; se a peça voltar, o passo volta como estava.
- No `pnpm dev`, cada clique leva de 0,2 a 1 s (o servidor recalcula o guia do projeto para
  conferir as regras); na versão rápida é bem menos.

### Revisão adversarial da Fase 5 (SPEC B.19.7)

- _O que machucaria um leigo?_
  - **Corrigido:** terminar o guia e depois trocar a FC ou os motores deixava "feitos" a primeira
    ligação, o sentido dos motores e o failsafe, feitos com as peças antigas. Agora esses passos
    voltam a pendente, com o checklist para confirmar de novo.
  - Os passos críticos não podem ser pulados (portões, conferidos no servidor, mesmo chamando a
    ação direto); desfazer apaga a confirmação; os alertas de cada passo aparecem nele, com as
    fontes; o primeiro passo do whoop e do FPV é treinar no simulador.
- _O que faria o drone não voar?_ O guia não muda o projeto: os parâmetros do firmware mostrados
  em cada passo são os do perfil versionado, com os valores calculados para as peças do projeto.
  O teste de integridade garante que todo parâmetro citado num passo tem valor.
- _O que estouraria o orçamento?_ Nada novo: o guia não tem custo; as ferramentas de cada passo
  são as da lista do projeto (com "já tenho").
- _Segurança do app:_ ações só do próprio computador, com zod (id do projeto UUID, id do passo
  no formato do catálogo, no máximo 30 itens de checklist); as regras são conferidas no servidor
  com os passos da versão atual.

**Dados do catálogo para você verificar:** os textos dos passos e dos checklists dos três
arquétipos (`data/catalog/drone/passos/`), principalmente os passos críticos, que agora são
portões no guia; e, como antes, os preços dos itens sem preço.
