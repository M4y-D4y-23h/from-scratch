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
- **Consequências:** usa minutos do GitHub Actions. Em repositório privado, minutos de Windows
  costumam consumir a cota gratuita mais rápido que os de Linux (confira a política de preços
  atual do GitHub). Se a cota apertar, dá para limitar a execução a pull requests.

## ADR-0013: arquitetura do Arquétipo 1 (drone com GPS, RTL, vídeo e celular)

- **Data:** 2026-10-04 · **Status:** aceita com ajustes: a escolha da telemetria padrão foi
  revista no **ADR-0017** (lá também estão resolvidos o baud e o failsafe do modo MAVLink do ELRS)
- **Contexto:** a SPEC (B.2.1) pede para confirmar a viabilidade técnica atual na documentação
  oficial do ArduPilot e do QGroundControl. Como `ardupilot.org` e `docs.qgroundcontrol.com`
  estavam bloqueados na sessão de nuvem, li o **código-fonte oficial dessas documentações** no
  GitHub (o mesmo texto que é publicado nos sites), em commits fixos:
  - Wiki do ArduPilot: [`ArduPilot/ardupilot_wiki@489284d`](https://github.com/ArduPilot/ardupilot_wiki/tree/489284d8a6be83519b55e6fbc11d2b7770fd75bb) (2026-10-03);
  - Notas de versão do ArduCopter: [`ArduPilot/ardupilot@e204ca7`, `ArduCopter/ReleaseNotes.txt`](https://github.com/ArduPilot/ardupilot/blob/e204ca77a8012342b52af17beb78adaca598113c/ArduCopter/ReleaseNotes.txt);
  - Documentação do QGroundControl: [`mavlink/qgroundcontrol@56fe54d`](https://github.com/mavlink/qgroundcontrol/tree/56fe54d1276c9f468272ce44a30deb591ac12834/docs/en) (2026-10-03, versão "daily");
  - Documentação do ExpressLRS: [`ExpressLRS/Docs@1cd98e7`](https://github.com/ExpressLRS/Docs/blob/1cd98e75640ff10706b36273953eec2110552e83/docs/software/mavlink.md) (2026-09-12).

### O que foi confirmado (com a página de origem)

1. **Firmware: ArduCopter 4.7.x.** A 4.7.0 saiu em 21/jul/2026 e a 4.7.1 em 31/ago/2026. Na 4.7
   vários parâmetros mudaram de nome e de unidade: **`RTL_ALT` (centímetros) virou `RTL_ALT_M`
   (metros, padrão 15 m)** e `ARMING_CHECK` virou `ARMING_SKIPCHK` (ReleaseNotes, seção 4.7.0).
   A SPEC cita `RTL_ALT`; o guia deve usar os nomes da versão instalada.
2. **Controladora (FC):** precisa estar na lista oficial (`common-autopilots.rst`). A própria
   página avisa que "a maioria das placas F4" (1 MB de memória) usa firmware reduzido, e a página
   `common-limited-firmware.rst` diz que falta de RAM pode impedir **calibração da bússola**, logs e
   MAVFTP. GPS e RTL existem nas placas de 1 MB, mas para um iniciante isso é risco desnecessário.
3. **Rádio ExpressLRS (ELRS):** funciona com ArduPilot pelo protocolo CRSF numa UART completa (com
   DMA nas F4/F7): `SERIALx_PROTOCOL = 23`, `RSSI_TYPE = 3` e o bit 13 de `RC_OPTIONS` (baud do
   ELRS) (`common-tbs-rc.rst`).
4. **Failsafe de rádio → RTL:** `FS_THR_ENABLE = 1` ("Enabled Always RTL"; se o GPS não estiver
   bom, ele pousa). Dispara após `RC_FS_TIMEOUT` (padrão 1 s). O receptor deve usar o modo "sem
   sinal". Quando o sinal volta, o drone **continua em RTL** até o piloto trocar o modo. Os testes
   podem ser feitos sem a bateria LiPo; se ligar a bateria, **tire as hélices antes**
   (`radio-failsafe.rst`).
5. **Failsafe de bateria:** precisa de módulo de energia (sensor de tensão/corrente).
   `BATT_LOW_VOLT` (abaixo por 10 s), `BATT_LOW_MAH` (sugestão: 20% da capacidade),
   `BATT_FS_LOW_ACT = 2` (RTL, marcado como recomendado). A opção 5 ("Terminate") desliga os
   motores no ar e é perigosa (`failsafe-battery.rst`).
6. **Failsafe da estação de solo (celular):** `FS_GCS_ENABLE` (1 = RTL), `FS_GCS_TIMEOUT` (padrão
   5 s); só fica ativo depois que um app de solo se conecta. O bit 4 de `FS_OPTIONS` faz ignorar
   essa perda quando o piloto está no controle (`gcs-failsafe.rst`).
7. **RTL não desvia de obstáculos:** sobe até `RTL_ALT_M` e volta **em linha reta** para onde o
   drone foi armado (o "home"). Só planeja caminho em volta de cercas com `OA_TYPE`, e de obstáculos
   reais apenas com sensores de proximidade. Depende de GPS e bússola bons e usa o barômetro para
   altura (`rtl-mode.rst`). → alertas de árvores e fios, `RTL_ALT_M` acima dos obstáculos do local e
   conferir o home antes de decolar.
8. **Geofence:** `FENCE_ENABLE`, `FENCE_TYPE` (bit 1 = cilindro em volta do home), `FENCE_RADIUS`
   (mínimo recomendado 30 m; "normalmente pelo menos 50 m"), `FENCE_ALT_MAX` (m), `FENCE_ACTION`;
   com cerca ligada, só arma com GPS travado (`common-ac2_simple_geofence.rst`,
   `common-geofencing-landing-page.rst`).
9. **Bússola e GPS:** módulo GPS+bússola por fora, alto, com céu livre, longe de motores e ESCs, a
   **pelo menos 10 cm de fios de potência e da bateria**; "o uso de mastro é altamente
   recomendado"; parafusos de nylon; torcer os fios de potência
   (`common-installing-3dr-ublox-gps-compass-module.rst`).
   ESC 4 em 1 tende a interferir menos; interferência medida pelo CompassMot: < 30% ok, 31–60%
   zona cinzenta, > 60% mover a bússola (`common-magnetic-interference.rst`,
   `common-compass-setup-advanced.rst`).
10. **Telemetria para o celular: duas opções documentadas.**
    - **A. Módulo Wi-Fi no drone** (ESP32 com DroneBridge ou ESP8266 com MAVESP8266): o celular
      entra na rede Wi-Fi do drone e o QGroundControl conecta sozinho por UDP 14550. Alcance em
      Wi-Fi comum: "150 m+" (o modo de 1 km exige outro ESP32 no solo). Usa **uma UART a mais**
      (`common-esp32-telemetry.rst`, `common-esp8266-telemetry.rst`).
    - **B. ELRS em modo MAVLink:** controle e telemetria pelo mesmo link de rádio e **uma única
      UART**; o celular conecta no Wi-Fi do módulo transmissor (TX Backpack), que fica com o piloto.
      Alcance da telemetria = alcance do rádio. Exige hardware ELRS baseado em ESP, firmware
      ELRS ≥ 3.5.0 e TX Backpack ≥ 1.5.0; trava a taxa de telemetria em 1:2 (docs do ELRS e
      `common-tbs-rc.rst`). **Divergência a verificar:** a wiki do ArduPilot manda
      `SERIALx_BAUD = 115`, a do ELRS manda `460`. O comportamento de failsafe nesse modo não está
      descrito explicitamente; exigiria teste de bancada (sem hélices) obrigatório.
11. **QGroundControl no celular:** Android 9 ou mais novo (32/64 bits). **Não há versão oficial para
    iPhone** (o guia de desenvolvimento diz que a versão iOS "não é mais suportada como build
    padrão"). O joystick virtual existe (Configurações → Geral → "Virtual joystick"), e a própria
    documentação avisa que ele "não é tão responsivo quanto um rádio RC" porque vai por MAVLink. O
    ArduPilot permite operar só pela estação de solo, mas diz que é "geralmente recomendado" usar o
    rádio RC como controle principal, e que o failsafe de GCS é "altamente recomendado" nesse caso
    (`common-gcs-only-operation.rst`).
12. **Vídeo no celular:** a documentação do QGC lista como fontes RTSP, UDP h.264/h.265,
    TCP-MPEG2, MPEG-TS e "Integrated Camera". No código, câmeras USB (UVC) aparecem na lista **se o
    sistema do aparelho as expuser como câmera**; no Android isso depende do fabricante. Ou seja:
    com o receptor USB de vídeo analógico, o vídeo pode precisar do **app do próprio receptor** (em
    tela dividida com o QGroundControl). O app deve dizer isso e pedir teste no celular do usuário.
13. **Segurança prática** (`safety-multicopter.rst`): ter sobra de potência, "idealmente pairar
    com ~50% do acelerador"; **iniciantes devem usar hélices de plástico** (as de fibra de carbono
    "cortam"); em estado desconhecido, cobrir as hélices com uma toalha e desligar a bateria;
    "a toalha grande é o equipamento de segurança mais importante, seguida de extintor e kit de
    primeiros socorros".
14. **Honestidade sobre custo** (`choosing-a-frame.rst`): com drones prontos baratos no mercado,
    "provavelmente há pouca vantagem de custo em montar o seu", principalmente nos pequenos.

### Decisão proposta

- **ArduCopter 4.7.x** estável; nomes de parâmetro da 4.7 no guia (com aviso para versões antigas).
- **FC da lista oficial com 2 MB de memória ou mais (classe H7)** como padrão do Arquétipo 1;
  placas F4 (1 MB) só como alternativa mais barata, com alerta explícito, ou excluídas.
- **Rádio ELRS 2,4 GHz em modo CRSF**, receptor em "sem sinal", `FS_THR_ENABLE = 1` (RTL).
- **Telemetria: opção A (Wi-Fi no drone) como padrão**, porque cada peça e cada failsafe estão
  documentados pelo ArduPilot e o controle continua independente do celular; **opção B (ELRS
  MAVLink) como alternativa "integrada"**, com teste de bancada obrigatório. O validador conta as
  UARTs conforme a opção: A = RC + GPS + telemetria (3); B = RC/telemetria + GPS (2).
- **Failsafes padrão:** rádio → RTL; bateria baixa → RTL (`BATT_FS_LOW_ACT = 2`); bateria crítica
  → pousar; GCS → RTL com `FS_OPTIONS` bit 4 (não disparar enquanto o piloto controla pelo rádio);
  geofence cilíndrica ligada.
- **Controle 100% pelo celular:** opção "experimental", com os alertas da SPEC e os ajustes de
  arme da página "GCS only"; nunca o padrão.
- **Vídeo:** padrão analógico 5,8 GHz + receptor USB (UVC) no Android, avisando que o vídeo pode
  ficar no app do receptor; alternativas na comparação: óculos digitais HD (melhor imagem e
  latência, mas não no celular), câmera de ação (gravação de qualidade, sem ao vivo de longo
  alcance) e vídeo digital por IP direto no QGC (avançado).
- **iPhone:** explicar que não há QGroundControl oficial nem suporte garantido a receptor USB de
  vídeo; sugerir um celular/tablet Android barato como tela de solo ou um notebook.
- **Regra do validador:** bússola a ≥ 100 mm de fios de potência/bateria (configurável, fonte
  acima) e mastro de GPS recomendado.
- **Equipamento de segurança:** propor incluir toalha grande, extintor e kit de primeiros socorros
  na lista de EPI (além da lista da SPEC B.6).

### Consequências

- O catálogo da Fase 1 precisa guardar, por FC: nome da placa no ArduPilot, memória flash,
  UARTs livres (e quais têm DMA), saídas de motor e BECs (tensão/corrente); por rádio: se o módulo
  é ESP (Wi-Fi/backpack) e a versão de ELRS suportada.
- Parâmetros de firmware entram no domínio como dados versionados (por versão do ArduCopter), não
  como texto solto do LLM.
- Pontos que dependem de você estão no plano da Fase 1 (`docs/PROGRESS.md`).

## ADR-0014: banco local com SQLite + Drizzle, driver `better-sqlite3`

- **Data:** 2026-10-04 · **Status:** aceita · **Verificado em:** 2026-10-04
- **Contexto:** a SPEC (B.3) pede SQLite + Drizzle com um driver que funcione no Windows, macOS e
  Linux "sem dor de cabeça" (sem Visual Studio Build Tools).
- **Decisão:**
  - **`better-sqlite3` 13** como driver. O pacote já traz os binários prontos (N-API) dentro dele,
    na pasta `prebuilds/`: `win32-x64`, `win32-arm64`, `darwin-x64`, `darwin-arm64`, `linux-x64`,
    `linux-arm64` e `linuxmusl`. Não tem script de instalação, então nada é compilado ao instalar
    (conferido no `package.json` e na pasta do pacote). API síncrona, simples para scripts de seed
    e para as rotas do servidor. O Drizzle tem driver oficial para ele (`drizzle-orm/better-sqlite3`).
  - **`drizzle-kit`** (ferramenta do próprio Drizzle, só em desenvolvimento) para gerar as
    migrações SQL a partir do schema em TypeScript.
  - **`tsx`** (só em desenvolvimento) para rodar scripts `.ts` (seed, checagem do catálogo) do
    mesmo jeito no PowerShell e no Linux, sem etapa de compilação.
  - `esbuild` (usado pelo `drizzle-kit` e pelo `tsx`) entra no `allowBuilds` como `false`: o script
    dele só confere o binário, que já vem pronto como dependência opcional de cada sistema (ADR-0003).
- **Alternativas descartadas:**
  - `node:sqlite` (embutido no Node): ainda é experimental no Node 22 (mostra `ExperimentalWarning`)
    e o `drizzle-orm` 0.45 não tem driver para ele. Reavaliar quando estabilizar.
  - `@libsql/client`: funciona, mas é assíncrono e traz um cliente de rede (Turso) que não usamos.
- **Consequências:** o arquivo do banco fica em `data/local/` (ignorado pelo git) e é recriado a
  partir do catálogo versionado. O CI no Windows prova que a instalação continua sem compilação.

## ADR-0015: catálogo em arquivos JSON versionados; o banco é só um espelho

- **Data:** 2026-10-04 · **Status:** aceita (decisão 3 da revisão da Fase 0, delegada a mim)
- **Contexto:** o catálogo (peças, tabelas de empuxo, ferramentas, arquétipos, passos, parâmetros
  de firmware) precisa ser editado e verificado por você (página `/catalogo`, SPEC B.6), testado
  no CI e usado pelo motor de cálculo. Era preciso escolher onde mora a "versão oficial".
- **Decisão:**
  - **Fonte da verdade: `data/catalog/drone/`**, em JSON, uma pasta por tipo (`componentes/`,
    `empuxo/`, `ferramentas/`, `arquetipos/`, `passos/`, `firmware/`). Cada arquivo é validado
    pelo schema zod e o conjunto passa por `checkCatalog` (ids únicos, tabela de empuxo apontando
    para motor e hélice que existem, empuxo que não diminui com mais acelerador, passos citando
    ferramentas e alertas que existem, selo ✅ só com fonte que tem link e data, "onde comprar"
    sem link de anúncio).
  - **Banco = espelho**: as tabelas do catálogo são reconstruídas numa transação sempre que o
    hash SHA-256 dos arquivos muda (`catalogo_meta`). O glossário (`docs/GLOSSARIO.md`) segue a
    mesma regra.
  - A futura página `/catalogo` vai gravar nos arquivos JSON (o app é local) e pedir nova
    sincronização. Cada verificação sua vira um `git diff` legível.
  - Cada versão de projeto guarda uma cópia do que usou e o hash do catálogo, para continuar
    reproduzível mesmo depois que o catálogo mudar.
- **Por quê:** revisável no git (preço/spec verificado aparece com data e fonte no diff);
  testável no CI do Windows e do Linux sem banco; não se perde se o banco for apagado; um lugar
  só para editar; os mesmos arquivos alimentam testes, seed e app.
- **Alternativas descartadas:** banco como fonte da verdade depois do seed (as verificações
  ficariam fora do git e do CI, e um banco apagado perderia o trabalho); catálogo em arquivos
  TypeScript (a página `/catalogo` não conseguiria editar com segurança).
- **Consequências:** `data/local/` (o banco) pode ser apagado a qualquer momento; `pnpm db:sync`
  ou a primeira abertura do app recria tudo. Edições feitas direto no banco são perdidas na
  próxima sincronização (por isso as tabelas do espelho não devem ser editadas à mão).

## ADR-0016: selos de confiança de valores calculados

- **Data:** 2026-10-04 · **Status:** aceita (decisão 2 da revisão da Fase 0, delegada a mim)
- **Contexto:** a SPEC define ✅/⚠️/❓ para dados do catálogo, mas não diz que selo recebe um
  valor calculado a partir deles (TWR, autonomia, total em R$, resultado de uma regra).
- **Decisão** (`src/domain/core/verification.ts`, testada):
  - Um valor derivado **herda o selo mais fraco** das entradas: uma peça ❓ deixa o cálculo ❓.
  - **Cálculo/estimativa nunca passa de ⚠️**, mesmo com tudo verificado: TWR, autonomia, ponto
    de pairar e somas de preço dependem de vento, temperatura, desgaste e margens.
  - **Comparação direta entre specs** (furação 16x19 = 16x19, conector XT60 = XT60) pode ser ✅
    se todas as specs comparadas forem ✅.
  - **Falta de dado nunca vira "passou"**: a regra responde "sem dado" com selo ❓. O relatório
    tem duas bandeiras: `bloqueado` (alguma regra bloqueante falhou) e `incompleto` (alguma regra
    bloqueante ficou sem dado). O app só pode dizer "compatível" quando as duas são falsas.
  - Regras baseadas em fato documentado oficialmente (ex.: "não há QGroundControl oficial para
    iPhone") usam ✅; heurísticas configuráveis (ex.: distância da bússola) usam ⚠️.
- **Por quê:** um leigo confia no ✅. Um TWR calculado com uma tabela de empuxo não conferida
  não pode parecer verificado.
- **Consequências:** enquanto o catálogo estiver todo ❓ (como manda a SPEC B.6), os resultados
  aparecerão ❓. Isso é intencional: à medida que você verificar peças e tabelas, os selos sobem.

## ADR-0017: arquitetura final do Arquétipo 1 (revisão do ADR-0013)

- **Data:** 2026-10-04 · **Status:** aceita (decisão 1 da revisão da Fase 0, delegada a mim);
  substitui a parte "Telemetria" da decisão proposta no ADR-0013
- **Contexto:** o ADR-0013 deixou a telemetria Wi-Fi no drone (opção A) como padrão porque o
  failsafe no modo MAVLink do ELRS (opção B) "não estava descrito" e havia divergência de baud.
  Com a rede liberada, conferi direto no **código-fonte** dos dois projetos:
  - **ExpressLRS** [`35bfdd2`](https://github.com/ExpressLRS/ExpressLRS/blob/35bfdd21cfa14e949eedb6aa08d135a8e496b0cf/src/src/rx-serial/SerialMavlink.cpp)
    (2026-10-04): no modo MAVLink o receptor manda os canais do rádio como mensagens
    `RC_CHANNELS_OVERRIDE` a cada 10 ms e **para de mandar quando o link cai** (`sendRCFrame`
    retorna sem enviar se não chegou quadro novo). A porta serial nesse modo é **460800 baud**
    ([`rx_main.cpp`](https://github.com/ExpressLRS/ExpressLRS/blob/35bfdd21cfa14e949eedb6aa08d135a8e496b0cf/src/src/rx_main.cpp)).
  - **ArduPilot** [`e204ca7`](https://github.com/ArduPilot/ardupilot/blob/e204ca77a8012342b52af17beb78adaca598113c/ArduCopter/radio.cpp)
    (2026-10-02): `Copter::read_radio()` aciona o **failsafe de rádio** quando passa
    `RC_FS_TIMEOUT` (padrão 1 s) sem entrada nova; `RC_Channels::read_input()` conta os
    overrides do MAVLink como entrada. Ou seja: perder o link no modo B dispara o mesmo failsafe
    → RTL do modo CRSF, em ~1 s.
  - A wiki do ArduPilot manda `SERIALx_BAUD = 115` no modo MAVLink do ELRS; o firmware do ELRS
    usa 460800 e a documentação do ELRS (atualizada em 27/07/2026) manda `460`. **Usamos 460**: a
    wiki está desatualizada nesse ponto.
  - No ArduCopter 4.7 os parâmetros de taxa de telemetria saíram de `SRx_*` para `MAVn_*`, e
    `SYSID_MYGCS` virou `MAV_GCS_SYSID` (padrão 255, o mesmo id que o receptor ELRS usa por
    padrão para mandar os comandos) (`ArduCopter/Parameters.cpp` e `libraries/GCS_MAVLink/GCS.cpp`
    no mesmo commit).
- **Decisão:**
  - **Telemetria padrão = B (ELRS em modo MAVLink)** sempre que rádio e receptor forem ELRS
    baseados em ESP e o rádio tiver TX Backpack com Wi-Fi (o solver escolhe rádios assim e a
    regra `elrs_mavlink_requisitos` confere). **A (Wi-Fi no drone)** fica como alternativa para
    rádios sem backpack. Sem nenhuma das duas, o drone voa só com o rádio e o OSD.
  - Mantido do ADR-0013: ArduCopter 4.7.x; FC H7 (2 MB) da lista oficial; rádio RC como
    controle principal; celular Android como tela; controle só pelo celular apenas como
    "experimental", com alertas; vídeo analógico 5,8 GHz com receptor USB como padrão.
  - O perfil de parâmetros do modo B inclui `SERIALx_PROTOCOL = 2`, `SERIALx_BAUD = 460`,
    `RSSI_TYPE = 5`, e o guia exige conferir que `RC_OVERRIDE_TIME` não é 0 e que o bit 1 de
    `RC_OPTIONS` ("ignorar overrides do MAVLink") está desligado. Com qualquer um dos dois o drone
    não recebe o rádio.
  - **Teste de bancada obrigatório (sem hélices) nas duas opções:** desligar o rádio e ver o
    QGroundControl acusar o failsafe de rádio e o modo mudar para RTL.
- **Por que B é melhor como padrão:**
  1. Telemetria (mapa, bateria, altura, botão de retorno) em **todo o alcance legal** (300 m
     no voo recreativo, ICA 100-40), não só nos ~150 m do Wi-Fi no drone. Um leigo vendo o mapa
     congelar no meio do voo tende a se assustar.
  2. **Menos peças e menos pontos de falha:** sem placa ESP32 para gravar, alimentar, fixar e
     afastar do GPS; uma UART a menos; menos peso e consumo.
  3. **Mais barato:** nada a comprar além do rádio e do receptor, que já estão no projeto.
  4. **Mesma segurança no failsafe de rádio** (conferido no código, acima) e mesma conexão no
     celular (QGroundControl por UDP 14550).
- **Custos aceitos:** limita a escolha de rádios (precisa de ESP + backpack; a maioria dos
  rádios ELRS atuais tem); a taxa de telemetria fica fixa em 1:2 (metade dos pacotes vai para
  telemetria, irrelevante para um drone de filmagem); o Wi-Fi do backpack alcança só 5–10 m, mas
  o celular fica com o piloto, ao lado do rádio.

## ADR-0018: preços em US$ da loja oficial + parâmetro de importação

- **Data:** 2026-10-04 · **Status:** aceita · **Verificado em:** 2026-10-04
- **Contexto:** a SPEC pede preços em R$ como estimativa com data, sem inventar, e trata
  impostos de importação como **parâmetro editável com data** (B.6); preço em tempo real
  (scraping) está fora da v1 (B.2). Ao pesquisar: Mercado Livre e Amazon Brasil respondem com
  página de verificação de robô; a API de busca do Mercado Livre exige autenticação (403). Não há
  como conferir preço de anúncio brasileiro de forma automática e honesta.
- **Decisão:**
  - Cada peça tem **`preco_referencia_usd`** (preço na loja oficial do fabricante ou em loja
    internacional conhecida, com link e data, sem frete e sem tributos) e/ou
    **`preco_estimado_brl`** (quando houver fonte brasileira). Pelo menos um dos dois é
    obrigatório (`checkCatalog`).
  - O custo em R$ das peças importadas é calculado com `data/catalog/drone/parametros/importacao.json`:
    câmbio PTAX de venda do Banco Central (02/10/2026: R$ 5,2238) e a regra da Receita Federal
    (página atualizada em 14/09/2026): em site do **Remessa Conforme**, imposto de importação
    **0% até US$ 50** e **60% menos US$ 30** acima disso; fora do programa, 60%; **ICMS de 17% a
    20%** conforme o estado, calculado "por dentro". Base legal: Lei nº 15.502/2026.
  - A faixa em R$ vai do cenário barato (peça sozinha no pacote, ICMS 17%) ao caro (peça num
    pacote grande ou site fora do programa: 60% sem desconto, ICMS 20%). Frete, IOF e spread do
    cartão ficam fora e aparecem no aviso. Sempre ⚠️.
  - Ferramentas usam as faixas em R$ da SPEC B.6 (passadas por você, out/2026, a verificar).
- **Consequências:** quando a regra mudar, basta editar o JSON (com nova data e fonte) e todos
  os custos são recalculados. O preço brasileiro de cada peça pode ser preenchido depois por
  você na página `/catalogo` (Fase 3), e passa a ter prioridade sobre a conversão.
