# Errata da SPEC

A `docs/SPEC.md` fica **íntegra** (é o pedido original do dono do projeto, não se formata nem se
edita). O que nela estiver desatualizado, incompleto ou tiver sido refinado de propósito fica
registrado aqui, com a fonte conferida e onde a correção já está aplicada. O dono autorizou
corrigir o que estiver errado em vez de seguir o texto (revisão da Fase 0, 2026-10-04).

Ao ler a SPEC, leia esta errata junto. Itens novos entram no fim de cada seção.

---

## 1. Correções (a SPEC está desatualizada ou incompleta)

### 1.1 `RTL_ALT` virou `RTL_ALT_M` (ArduCopter 4.7)

- **SPEC B.2.1, passos do Arquétipo 1:** "altitude de retorno (RTL_ALT)".
- **Correto:** no ArduCopter 4.7 o parâmetro é **`RTL_ALT_M`, em metros** (padrão 15 m). O antigo
  `RTL_ALT` (até a 4.6) era em **centímetros**: num firmware antigo, digitar "30" achando que são
  metros deixa a altura mínima de retorno em 30 cm, e o drone volta na altura em que estiver (sem
  subir antes), podendo bater em árvores e fios. Ao atualizar da 4.6 para a 4.7, o firmware
  converte o valor salvo sozinho.
- **Fonte:** código do ArduPilot, `ArduCopter/mode_rtl.cpp`, commit
  [`e204ca7`](https://github.com/ArduPilot/ardupilot/blob/e204ca77a8012342b52af17beb78adaca598113c/ArduCopter/mode_rtl.cpp)
  (2026-10-02, com a tabela de conversão dos nomes antigos), comparado com
  `ArduCopter/Parameters.cpp` da tag
  [`Copter-4.6.3`](https://github.com/ArduPilot/ardupilot/blob/92b0cd788ec29406f26c6f9c31d5ceedbd1cc538/ArduCopter/Parameters.cpp).
- **Aplicado em:** perfil `data/catalog/drone/firmware/arducopter-4.7.json` (`RTL_ALT_M = 30`, com
  a unidade e o aviso para versões antigas) e nos passos do Arquétipo 1.

### 1.2 Outros parâmetros renomeados no ArduCopter 4.7

A SPEC não cita estes nomes, mas qualquer guia ou tutorial antigo usa os nomes velhos:

| Antes (até 4.6)                       | ArduCopter 4.7                           | Observação                                                        |
| ------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `RTL_ALT` (cm)                        | `RTL_ALT_M` (m)                          | Item 1.1.                                                         |
| `RTL_ALT_FINAL`, `RTL_CLIMB_MIN` (cm) | `RTL_ALT_FINAL_M`, `RTL_CLIMB_MIN_M` (m) | Mesma mudança de centímetros para metros.                         |
| `RTL_SPEED` (cm/s)                    | `RTL_SPEED_MS` (m/s)                     | Velocidade de retorno.                                            |
| `ARMING_CHECK`                        | `ARMING_SKIPCHK`                         | Lógica invertida: agora lista o que **pular**; 0 = não pula nada. |
| `SRx_*`                               | `MAVn_*`                                 | Taxas de telemetria por porta MAVLink.                            |
| `SYSID_MYGCS`                         | `MAV_GCS_SYSID`                          | Padrão 255, o mesmo id que o receptor ELRS usa por padrão.        |

- **Fonte:** código do ArduPilot no mesmo commit `e204ca7`: `ArduCopter/mode_rtl.cpp`,
  `libraries/AP_Arming/AP_Arming.cpp`, `ArduCopter/Parameters.cpp` e
  `libraries/GCS_MAVLink/GCS.cpp` (ADR-0017); notas de versão
  [`ArduCopter/ReleaseNotes.txt`](https://github.com/ArduPilot/ardupilot/blob/e204ca77a8012342b52af17beb78adaca598113c/ArduCopter/ReleaseNotes.txt)
  ("ARMING_CHECK replaced with ARMING_SKIPCHK", PR 31568; "Streamrates, sysid, mygcs-sysid, etc
  moved to MAV_ parameters", PR 29617).
- **Aplicado em:** perfil `arducopter-4.7.json` (nota "nomes de parâmetros do ArduCopter 4.7").

### 1.3 Até 250 g não dispensa as regras do DECEA ao ar livre

- **SPEC B.2.1, alertas:** "peso acima de 250 g → cadastro e regras da ANAC/DECEA" (dá a entender
  que até 250 g não há regra).
- **Correto:**
  - **ANAC** (Resolução nº 806/2026): até 250 g dispensa o **cadastro** do drone e o seguro;
    quem tem menos de 18 anos voa acompanhado por um adulto (art. 7º).
  - **DECEA** (ICA 100-40/2026): a solicitação de acesso ao espaço aéreo (SARPAS) **vale também
    para até 250 g** (art. 19, § 4º); com óculos FPV, o **observador ao lado é obrigatório** (art.
    24: sem ele, o voo conta como fora da linha de visada); voo recreativo até 60 m de altura e
    300 m de distância (art. 32); dentro de casa (área confinada) não é espaço aéreo (art. 31);
    voo recreativo em área de recreação designada dispensa a solicitação (art. 55, § 2º).
- **Fontes:** [ANAC, Resolução nº 806/2026](https://www.anac.gov.br/assuntos/legislacao/legislacao-1/resolucoes/2026/resolucao-806)
  e [DECEA, ICA 100-40/2026](https://publicacoes.decea.mil.br/publicacao/ica-100-40), lidas em
  2026-10-04. Informativo, não é aconselhamento jurídico.
- **Aplicado em:** alertas `ate-250g` (Arquétipo 3), `acima-250g` (Arquétipos 1 e 2),
  `regulamentacao` e `video-e-visada` (globais).

---

## 2. Refinamentos (a SPEC permitia; a escolha está documentada)

### 2.1 Telemetria do Arquétipo 1: ELRS em modo MAVLink, não Wi-Fi no drone

- **SPEC B.2.1:** "telemetria MAVLink via Wi-Fi (ex: módulo de telemetria Wi-Fi **ou outra solução
  atual e compatível que você pesquisar**)".
- **Escolha:** padrão = **ExpressLRS em modo MAVLink** (o celular conecta no Wi-Fi do módulo do
  rádio); Wi-Fi no drone fica como alternativa para rádios sem backpack. Motivos, fontes e o teste
  de bancada obrigatório no **ADR-0017**.
- **Consequência no aceite da Fase 1** ("valida UARTs (RC + GPS + telemetria)"): no modo MAVLink,
  rádio e telemetria dividem **uma** UART, então o padrão usa 2 (RC/telemetria + GPS). O validador
  conta as UARTs conforme a opção de telemetria escolhida (3 com Wi-Fi no drone).

### 2.2 Campos de fonte e de preço do modelo de dados (SPEC B.5)

A SPEC pede "refine e documente". Mudanças:

| SPEC B.5                               | Implementado                                                 | Por quê                                                                                                                               |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `Component.fonte_spec_url`             | `fontes: [{titulo, tipo, url, acessado_em}]`                 | Uma peça costuma precisar de várias fontes (página do fabricante, manual, código do firmware), cada uma com título e data.            |
| `ThrustData.fonte_url`                 | `fontes` (mínimo 1)                                          | Tabela de empuxo sem fonte não entra no catálogo.                                                                                     |
| `preco_estimado_brl: {min, max, data}` | mantido + `preco_referencia_usd` com conversão parametrizada | Preço brasileiro não pode ser conferido automaticamente; a loja oficial em US$ + regra de importação dá uma faixa honesta (ADR-0018). |
| `massa_g`                              | mantido + `massa_estimada_g: {valor, motivo}`                | Quando o fabricante não publica a massa, a estimativa fica explícita e o relatório avisa.                                             |

Os nomes de entidades (inglês) e de campos (português) seguem o **ADR-0022**.

---

## 3. Divergências em documentação oficial de terceiros

Não são erros da SPEC, mas mudam o que o app manda fazer:

- **Baud do ELRS em modo MAVLink:** a wiki do ArduPilot manda `SERIALx_BAUD = 115`; o firmware do
  ExpressLRS usa **460800** e a documentação do ELRS manda `460`. Usamos **460** (ADR-0017; código
  do ELRS, commit `35bfdd2`, `src/src/rx_main.cpp`).
- **Betaflight 2026.6:** `failsafe_off_delay` passou a se chamar `failsafe_landing_time`. O perfil
  `betaflight-4.5` usa os nomes da 4.5 (conferidos nas tags 4.5.3 e 2026.6.2; ADR-0020).

---

## 4. Pontos em aberto (para o dono decidir)

- **Whoop "iniciante" (SPEC B.2) × fórmula de dificuldade (SPEC B.8):** com os limites de rótulo
  da B.8, qualquer projeto com um passo de nível 2 sai "Intermediário" ou acima; o Tiny Whoop sai
  com nota 1,8 ("Intermediário"), a menor dos três. Se você quiser o whoop como "Iniciante", o
  ajuste certo é nos limites dos rótulos (`config.ts`), não nos níveis dos passos (ADR-0020).
