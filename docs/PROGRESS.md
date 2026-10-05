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
