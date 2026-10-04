# Glossário

Fonte dos termos exibidos na interface (tooltips e página de glossário). **Rascunho da Fase 0**:
os termos abaixo são os jargões citados na SPEC (B.1.5). A partir da Fase 1 este arquivo vira a
entrada do `GlossaryTerm` (o formato abaixo será lido por código, então mantenha a estrutura).

Formato de cada termo:

- título `##` com o termo;
- **Explicação:** uma ou duas frases simples, sem outros jargões (ou com jargões que também estão
  aqui);
- **Analogia:** comparação com algo do dia a dia;
- **Relacionados:** outros termos do glossário, separados por vírgula (os que ainda não têm
  verbete serão escritos na Fase 1; um teste vai exigir que todo termo relacionado exista).

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
