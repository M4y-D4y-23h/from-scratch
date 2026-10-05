# Glossário

Fonte dos termos exibidos na interface (tooltips e página de glossário). Este arquivo é lido por
código (`GlossaryTerm`, espelhado no banco), então mantenha a estrutura. Termos técnicos que a
comunidade usa em inglês (Failsafe, Hover, Frame, Stack...) ficam em inglês, com a explicação em
português (ADR-0022): traduzir faria a palavra perder o sentido que o leigo vai encontrar nos
manuais, nos programas e nas lojas.

Formato de cada termo:

- título `##` com o termo;
- **Explicação:** uma ou duas frases simples, sem outros jargões (ou com jargões que também estão
  aqui);
- **Analogia:** comparação com algo do dia a dia;
- **Relacionados:** outros termos do glossário, separados por vírgula (um teste exige que todo
  termo relacionado tenha verbete);
- **Não sublinhar antes de:** (opcional) palavras que, logo depois do termo, mostram que o texto
  fala de outra coisa. Exemplo: em "receptor USB" o assunto é o receptor de vídeo, então o verbete
  "Receptor" (o do rádio) não aparece ali.

Na interface, o termo é reconhecido com ou sem maiúscula inicial e no plural ("hélices",
"receptores de vídeo"). Siglas (ESC, FC) só contam em maiúsculas.

---

## KV

- **Explicação:** número que diz quantas rotações por minuto o motor dá, sem carga, para cada volt
  da bateria. Um motor de 1000 KV numa bateria de 10 V giraria cerca de 10.000 rpm sem hélice.
- **Analogia:** como as marchas de uma bicicleta: KV alto é marcha leve (gira rápido, combina com
  hélice pequena); KV baixo é marcha pesada (gira devagar com mais força, combina com hélice
  grande).
- **Relacionados:** Motor brushless, Hélice, Célula

## LiPo

- **Explicação:** bateria de polímero de lítio, a mais usada em drones porque entrega muita
  energia para o seu peso. Pode pegar fogo se for furada, amassada, carregada errado ou
  descarregada demais. Cada célula tem 3,7 V nominais e 4,2 V quando cheia.
- **Analogia:** um tanque de combustível muito potente: leva o drone longe, mas precisa ser tratado
  com o mesmo respeito.
- **Relacionados:** Célula, C-rating, Carregador balanceador

## ESC

- **Explicação:** controlador eletrônico de velocidade. Recebe a energia da bateria e a ordem da
  FC, e transforma isso no sinal que faz o motor girar na velocidade certa.
- **Analogia:** o pedal do acelerador de cada motor.
- **Relacionados:** FC, Motor brushless, Stack

## FC

- **Explicação:** controladora de voo, o "cérebro" do drone. Lê sensores de movimento centenas de
  vezes por segundo e corrige a velocidade de cada motor para o drone ficar estável e obedecer ao
  controle.
- **Analogia:** o equilibrista que faz pequenos ajustes o tempo todo para não cair.
- **Relacionados:** ESC, Firmware, UART

## VTX

- **Explicação:** transmissor de vídeo. Envia por rádio a imagem da câmera do drone para os óculos
  ou para um receptor ligado ao celular. Precisa respeitar as regras de potência e homologação da
  Anatel.
- **Analogia:** uma pequena emissora de TV levada pelo drone.
- **Relacionados:** Câmera FPV, Antena, 5,8 GHz

## TWR

- **Explicação:** relação empuxo/peso: quanto de força para cima os motores conseguem fazer,
  dividido pelo peso do drone. TWR 2 significa que os motores, no máximo, levantariam o dobro do
  peso. Abaixo de 2 o drone não tem folga para voar com segurança.
- **Analogia:** um elevador que aguenta o dobro da carga tem margem para subir com folga; um que
  aguenta só a própria carga mal sai do chão.
- **Relacionados:** Empuxo, AUW, Hover

## C-rating

- **Explicação:** número da bateria que indica a corrente máxima que ela aguenta entregar: corrente
  máxima ≈ capacidade (em Ah) × C. Uma bateria de 1,5 Ah e 100C entregaria até cerca de 150 A. O
  número impresso costuma ser otimista, por isso o app usa margem de segurança.
- **Analogia:** a largura do cano de uma caixa d'água: quanto mais largo, mais água sai de uma vez.
- **Relacionados:** LiPo, Corrente, ESC

## 5,8 GHz

- **Explicação:** faixa de frequência de rádio usada pela maioria dos transmissores de vídeo de
  drones FPV. É dividida em canais: dois transmissores no mesmo canal atrapalham a imagem um do
  outro. Os transmissores precisam respeitar as regras da Anatel.
- **Analogia:** como as estações de uma rádio FM: cada canal é uma estação, e duas no mesmo número
  viram chiado.
- **Relacionados:** VTX, Antena, Câmera FPV

## Antena

- **Explicação:** peça que manda ou recebe o sinal de rádio. O transmissor de vídeo nunca pode ser
  ligado sem ela, porque a energia que deveria sair pelo ar volta e queima o transmissor.
- **Analogia:** a boca e o ouvido do rádio: sem ela, o sinal não sai nem entra.
- **Relacionados:** VTX, 5,8 GHz, Receptor

## AUW

- **Explicação:** peso total de decolagem (do inglês "all-up weight"): drone, bateria, câmera e
  tudo o mais que voa. É o peso que os motores precisam levantar.
- **Analogia:** o peso do carro já com o motorista, os passageiros e a bagagem.
- **Relacionados:** TWR, Empuxo, Hover

## Câmera FPV

- **Explicação:** câmera pequena que manda a imagem ao vivo para o transmissor de vídeo, para você
  pilotar vendo o que o drone vê. É feita para ter pouco atraso, não para filmar com qualidade.
- **Analogia:** o retrovisor do carro: mostra o caminho na hora, mas ninguém tira foto com ele.
- **Relacionados:** VTX, FPV, OSD

## Carregador balanceador

- **Explicação:** carregador de bateria que confere e iguala a tensão de cada célula durante a
  carga. É o único jeito seguro de carregar uma bateria LiPo de várias células.
- **Analogia:** encher vários copos ao mesmo tempo olhando cada um, para nenhum transbordar.
- **Relacionados:** LiPo, Célula, LiHV

## Célula

- **Explicação:** cada "pilha" dentro de uma bateria de lítio. Uma bateria 4S tem 4 células em
  série; a LiPo tem 3,7 V por célula (4,2 V cheia), então uma 4S tem cerca de 14,8 V.
- **Analogia:** os vagões de um trem: quanto mais vagões em fila, mais força o trem leva.
- **Relacionados:** LiPo, LiHV, KV

## Corrente

- **Explicação:** quantidade de eletricidade que passa pelo fio a cada segundo, medida em ampères
  (A). Motores fortes pedem muita corrente; fio fino ou peça fraca esquenta e pode queimar.
- **Analogia:** a quantidade de água que passa num cano por segundo.
- **Relacionados:** C-rating, ESC, BEC

## Empuxo

- **Explicação:** força que o conjunto motor + hélice faz para levantar o drone, medida em gramas.
  O fabricante publica uma tabela de empuxo para cada motor, hélice e bateria.
- **Analogia:** a força de um ventilador empurrando o ar para baixo; o drone sobe pela reação.
- **Relacionados:** TWR, Hélice, Motor brushless

## Firmware

- **Explicação:** o programa gravado numa placa eletrônica do drone. Na controladora de voo,
  ArduPilot e Betaflight são firmwares: cada um tem jeitos diferentes de configurar e recursos
  diferentes. ESCs e receptores também têm o seu: nos ESCs do projeto, BLHeli_S ou Bluejay; no
  receptor, ExpressLRS, que precisa estar na mesma versão do rádio.
- **Analogia:** o sistema operacional de um celular.
- **Relacionados:** FC, ArduPilot, Betaflight, ESC, Receptor, ExpressLRS

## Hélice

- **Explicação:** a peça que gira presa ao motor e empurra o ar. Tem tamanho (em polegadas) e
  sentido de giro; se for colocada no motor errado, o drone capota ao decolar. Corta como faca.
- **Analogia:** o ventilador de teto, só que muito mais rápido e perigoso.
- **Relacionados:** Empuxo, Motor brushless, KV

## Hover

- **Explicação:** pairar: o drone parado no ar, sem subir nem descer. O app calcula quanto do
  acelerador o drone precisa para pairar; o ideal é perto da metade, para sobrar força.
- **Analogia:** um beija-flor parado na frente da flor.
- **Relacionados:** Throttle, TWR, AUW

## Motor brushless

- **Explicação:** motor sem escovas, usado em todos os drones deste app. Precisa de um ESC para
  funcionar e é identificado pelo tamanho (ex.: 2207) e pelo KV.
- **Analogia:** um motor de ventilador moderno: forte, silencioso e sem peças que se gastam por
  atrito.
- **Relacionados:** KV, ESC, Hélice

## Stack

- **Explicação:** a controladora de voo e a placa de ESC empilhadas uma sobre a outra, presas nos
  mesmos furos (por exemplo, 20 x 20 mm ou 30,5 x 30,5 mm).
- **Analogia:** um sanduíche de duas placas eletrônicas.
- **Relacionados:** FC, ESC, AIO

## UART

- **Explicação:** porta de comunicação da controladora de voo. Cada aparelho que conversa com ela
  (receptor do rádio, GPS, telemetria, transmissor de vídeo) ocupa uma UART.
- **Analogia:** as tomadas de uma parede: cada aparelho precisa da sua.
- **Relacionados:** FC, Receptor, GPS

## Failsafe

- **Explicação:** o que o drone faz sozinho quando algo dá errado, como perder o sinal do rádio
  ou a bateria ficar fraca. No ArduPilot do projeto ele volta para casa (RTL); no Betaflight,
  desliga os motores.
- **Analogia:** o freio de emergência do trem, que age se o maquinista não responde.
- **Relacionados:** RTL, Receptor, Betaflight

## RTL

- **Explicação:** retorno automático para casa (do inglês "return to launch"): o drone sobe até
  uma altura definida e volta em linha reta para onde decolou. Ele não desvia de árvores e fios.
- **Analogia:** o caminho de volta de um GPS de carro, só que em linha reta e sem enxergar
  obstáculos.
- **Relacionados:** GPS, Failsafe, Bússola

## GPS

- **Explicação:** receptor que descobre a posição do drone pelos satélites. Sem ele o drone não
  sabe onde está e não consegue voltar sozinho para casa.
- **Analogia:** o aplicativo de mapa do celular, a bordo do drone.
- **Relacionados:** Bússola, RTL, UART

## Bússola

- **Explicação:** sensor que diz para onde o drone está virado. Fica no módulo do GPS, longe dos
  fios grossos, porque a corrente da bateria cria campo magnético e engana a bússola.
- **Analogia:** a bússola de escoteiro, que erra se você chega perto de um ímã.
- **Relacionados:** GPS, RTL, Corrente

## BEC

- **Explicação:** regulador de tensão que transforma a tensão alta da bateria em 5 V ou 9 V para
  alimentar câmera, receptor e GPS. Cada BEC tem um limite de corrente.
- **Analogia:** o carregador do celular, que baixa a tensão da tomada para o celular aguentar.
- **Relacionados:** FC, Corrente, Receptor

## Frame

- **Explicação:** a estrutura do drone, onde se prendem motores, placas e bateria. O tamanho dele
  define a hélice máxima e a furação dos motores e da stack.
- **Analogia:** o chassi de um carro.
- **Relacionados:** Hélice, Stack, Motor brushless

## Throttle

- **Explicação:** acelerador: o manche do rádio que controla a força de todos os motores juntos.
  Em porcentagem, 0% é parado e 100% é a força máxima.
- **Analogia:** o pedal do acelerador do carro.
- **Relacionados:** Hover, Armar, ESC

## Armar

- **Explicação:** liberar os motores para girar. Desarmado, o drone ignora o acelerador. Arme só
  no local de voo, com as pessoas longe, e desarme logo depois de pousar.
- **Analogia:** girar a chave da ignição do carro: antes disso, pisar no acelerador não faz nada.
- **Relacionados:** Throttle, Failsafe, FC

## FPV

- **Explicação:** pilotar vendo pela câmera do drone, em óculos ou numa tela (do inglês "first
  person view"). Como você deixa de ver o drone, a regra exige um observador ao seu lado.
- **Analogia:** jogar videogame em primeira pessoa, só que com um drone de verdade.
- **Relacionados:** Câmera FPV, VTX, OSD

## OSD

- **Explicação:** informações escritas por cima da imagem do vídeo (do inglês "on-screen
  display"): tensão da bateria, tempo de voo, avisos.
- **Analogia:** o painel do carro projetado no para-brisa.
- **Relacionados:** FPV, Câmera FPV, Betaflight

## Receptor

- **Explicação:** a peça no drone que recebe os comandos do rádio. Rádio e receptor precisam ser
  do mesmo sistema (no projeto, ExpressLRS de 2,4 GHz) e estar pareados. Não confundir com o
  receptor de vídeo, que recebe a imagem da câmera.
- **Analogia:** o sensor da TV que recebe os comandos do controle remoto.
- **Relacionados:** ExpressLRS, UART, Antena, Receptor de vídeo
- **Não sublinhar antes de:** OTG, USB, UVC

## Receptor de vídeo

- **Explicação:** a peça que recebe a imagem enviada pelo transmissor de vídeo (VTX) do drone e a
  mostra numa tela: um aparelho que liga no celular Android pela entrada USB, ou o receptor que já
  vem dentro dos óculos FPV. Precisa ser do mesmo sistema do VTX (no projeto, vídeo analógico de
  5,8 GHz). Não confundir com o receptor do rádio, que recebe os comandos.
- **Analogia:** a TV sintonizando um canal: o VTX é a emissora e o receptor de vídeo é a TV.
- **Relacionados:** VTX, 5,8 GHz, FPV, Receptor

## AIO

- **Explicação:** placa "tudo em um" (do inglês "all in one"): controladora de voo, ESC e, às
  vezes, receptor e transmissor de vídeo numa placa só. É a placa dos whoops.
- **Analogia:** um computador "tudo em um", com a tela e o computador juntos.
- **Relacionados:** FC, ESC, Whoop

## Whoop

- **Explicação:** micro drone com dutos em volta das hélices, leve e feito para voar dentro de
  casa. Batidas leves não estragam nada e machucam muito menos.
- **Analogia:** um carrinho de bate-bate: dá para encostar sem drama.
- **Relacionados:** AIO, LiHV, FPV

## LiHV

- **Explicação:** variação da bateria LiPo que, cheia, chega a 4,35 V por célula (a LiPo comum
  chega a 4,20 V). Só pode ser carregada no modo LiHV se a bateria for LiHV.
- **Analogia:** um tanque que aceita um pouco mais de combustível, mas só o certo.
- **Relacionados:** LiPo, Célula, Carregador balanceador

## BNF

- **Explicação:** drone pronto "bind and fly": vem montado e configurado, mas sem rádio, óculos e
  baterias. Você só pareia o seu rádio.
- **Analogia:** um celular vendido sem chip e sem carregador.
- **Relacionados:** RTF, Receptor, ExpressLRS

## RTF

- **Explicação:** drone pronto "ready to fly": vem com tudo para voar, incluindo o rádio (e, nos
  de FPV, os óculos).
- **Analogia:** um celular que já sai da caixa com chip e carregador.
- **Relacionados:** BNF, FPV, Whoop

## ArduPilot

- **Explicação:** firmware aberto para drones com GPS: retorno automático, cerca virtual e missões.
  É o firmware do drone com GPS do projeto (Arquétipo 1).
- **Analogia:** um piloto automático de avião, em miniatura.
- **Relacionados:** Firmware, RTL, Failsafe

## Betaflight

- **Explicação:** firmware aberto para drones FPV ágeis (5" e whoops): resposta rápida e muita
  configuração de voo, mas sem retorno automático para casa sem GPS.
- **Analogia:** o câmbio manual de um carro esportivo: mais controle, menos ajuda automática.
- **Relacionados:** Firmware, OSD, Failsafe

## ExpressLRS

- **Explicação:** sistema aberto de rádio de controle (ELRS), com longo alcance e pouco atraso. Rádio
  e receptor precisam ter versões compatíveis e a mesma frase de pareamento.
- **Analogia:** o Bluetooth do controle de videogame, só que com alcance de quilômetros.
- **Relacionados:** Receptor, BNF, Failsafe

## SARPAS

- **Explicação:** sistema do DECEA onde se pede o acesso ao espaço aéreo antes de voar ao ar livre,
  inclusive com drones de até 250 g. Dentro de casa (área confinada) não é preciso.
- **Analogia:** reservar a quadra antes de jogar.
- **Relacionados:** FPV, RTL, Whoop

## Smoke stopper

- **Explicação:** aparelho ligado entre a bateria e o drone na primeira ligação: se houver um curto,
  ele corta a corrente antes de queimar as placas.
- **Analogia:** o disjuntor da casa, que desarma antes do fio pegar fogo.
- **Relacionados:** Corrente, LiPo, ESC

## Entre-eixos

- **Explicação:** a distância, em milímetros, entre os centros de dois motores em diagonal. É o
  número que define o "tamanho" do drone: 450 mm, 236 mm (5"), 65 mm (whoop). Ele limita a hélice
  máxima que cabe sem as pás se baterem.
- **Analogia:** como o aro de uma bicicleta: diz o tamanho da roda que cabe no quadro.
- **Relacionados:** Frame, Hélice

## DeadCat

- **Explicação:** formato de frame de FPV em que os braços da frente ficam mais abertos que os de
  trás, para as hélices não aparecerem na imagem da câmera. No 3D, o From Scratch desenha esse
  formato como um X a partir do entre-eixos (posição dos motores aproximada).
- **Analogia:** como abrir os braços para enxergar melhor o que está à sua frente.
- **Relacionados:** Frame, Entre-eixos, Câmera FPV
