import { type DroneIntent, EMPTY_INTENT, sanitizeIntent } from "./intent";
import { normalizeText } from "./safety-filter";

/*
 * "Modo simples": extrai a intenção de um pedido por palavras-chave, sem IA. Usado quando não há
 * chave da API (ou ela falha) e nos testes. Entende os pedidos diretos ("drone pequeno pra voar
 * dentro de casa", "até R$ 2.000", "1 hora de voo"); pedidos livres e ambíguos são melhores com
 * a IA, e a interface avisa quando o modo simples foi usado.
 */

/** "2.000" -> 2000; "1,5" -> 1.5; "2 mil" -> 2000; "uma" -> 1; "meia" -> 0.5. */
export function parseNumberPt(raw: string, mil = false): number | undefined {
  const t = raw.trim();
  const palavras: Record<string, number> = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    meia: 0.5,
    meio: 0.5,
  };
  let n: number;
  if (t in palavras) n = palavras[t] as number;
  else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/\./g, "").replace(",", "."));
  else if (/^\d+(,\d+)?$/.test(t)) n = Number(t.replace(",", "."));
  else if (/^\d+\.\d+$/.test(t)) n = Number(t);
  else return undefined;
  if (!Number.isFinite(n)) return undefined;
  return mil ? n * 1000 : n;
}

const NUM = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:[.,]\\d+)?|uma?|meia|meio|dois|duas)";

function first(texto: string, re: RegExp): RegExpExecArray | null {
  return re.exec(texto);
}

const VALOR = "(?<n>\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|\\d+(?:,\\d+)?)";

/** "R$ 2.000", "R$2000", "2 mil reais", "1.500 reais", "orçamento de 3 mil". */
function orcamento(texto: string): number | null {
  const padroes = [
    new RegExp(`r\\$\\s*${VALOR}\\s*(?<mil>mil)?`),
    new RegExp(`${VALOR}\\s*(?<mil>mil)?\\s*(reais|conto)`),
    new RegExp(`(orcamento|gastar|ate|no maximo)\\s+(de\\s+)?${VALOR}\\s*(?<mil>mil)\\b`),
  ];
  for (const re of padroes) {
    const m = re.exec(texto);
    const n = m?.groups?.n;
    if (!n) continue;
    const v = parseNumberPt(n, Boolean(m.groups?.mil));
    if (v !== undefined) return v;
  }
  return null;
}

function medida(texto: string, unidades: string, fator: Record<string, number>): number | null {
  const m = first(texto, new RegExp(`${NUM}\\s*(${unidades})\\b`));
  if (!m?.[1] || !m[2]) return null;
  const v = parseNumberPt(m[1]);
  const unidade = Object.keys(fator).find((u) => m[2]?.startsWith(u));
  return v === undefined || !unidade ? null : v * (fator[unidade] ?? 1);
}

const tem = (texto: string, re: RegExp) => re.test(texto);

export function heuristicIntent(pedido: string): DroneIntent {
  const t = normalizeText(pedido);
  const intent: DroneIntent = { ...EMPTY_INTENT, observacoes: [] };

  // Finalidade (a mais específica primeiro).
  if (
    tem(t, /\b(carreg\w*|transport\w*|levar|entreg\w*|carga)\b/) &&
    tem(t, /\b\d.*\b(kg|quilos?)\b/)
  )
    intent.finalidade = "carga";
  else if (tem(t, /\b(corrida|racing|racer|correr|competi\w*)\b/)) intent.finalidade = "corrida";
  else if (tem(t, /\b(freestyle|manobras?|acrobac\w*|radical)\b/)) intent.finalidade = "freestyle";
  else if (
    tem(
      t,
      /\b(film\w*|grav\w*|fotos?|fotograf\w*|imagens?|video|viage\w*|casamentos?|paisage\w*)\b/,
    )
  )
    intent.finalidade = "filmar";
  else if (tem(t, /\b(aprend\w*|inician\w*|comecar|primeiro drone|treinar|novato)\b/))
    intent.finalidade = "aprender";
  else if (tem(t, /\b(diversao|brincar|lazer|hobby)\b/)) intent.finalidade = "lazer";

  // Ambiente.
  const dentro = tem(
    t,
    /\b(dentro de casa|em casa|indoor|apartamento|quarto|sala|dentro do quarto)\b/,
  );
  const fora = tem(
    t,
    /\b(ao ar livre|campo|parque|praia|viage\w*|fazenda|plantacao|sitio|montanha|trilha|rua|outdoor|longe)\b/,
  );
  intent.ambiente =
    dentro && fora ? "os_dois" : dentro ? "dentro_de_casa" : fora ? "ao_ar_livre" : "nao_informado";

  intent.orcamento_max_brl = orcamento(t);
  if (tem(t, /\b(so (para|pras?) (as )?pecas|sem (as )?ferramentas)\b/))
    intent.orcamento_inclui_ferramentas = false;
  else if (tem(t, /\b(com|incluindo|contando) (as )?ferramentas\b/))
    intent.orcamento_inclui_ferramentas = true;

  // Peso: "sub-250", "menos de 250 g", "abaixo de 250 gramas".
  const peso = first(
    t,
    new RegExp(`(sub-?|menos de |abaixo de |ate |no maximo )${NUM}\\s*(g|gramas)\\b`),
  );
  if (peso?.[2]) intent.limite_peso_g = parseNumberPt(peso[2]) ?? null;
  else if (tem(t, /\bsub-?250\b/)) intent.limite_peso_g = 250;

  // Autonomia: "1 hora de voo", "30 minutos de voo", "meia hora".
  intent.autonomia_min_desejada = medida(t, "horas?|h|minutos?|min", {
    hora: 60,
    h: 60,
    minuto: 1,
    min: 1,
  });
  if (
    intent.autonomia_min_desejada !== null &&
    !tem(t, /\b(voo|voar|voa|autonomia|bateria|dure|dura|aguente)\b/)
  )
    intent.autonomia_min_desejada = null;

  // Alcance: "10 km longe", "500 metros de distância".
  const alcance = medida(t, "km|quilometros?|metros?|m", {
    km: 1000,
    quilometro: 1000,
    metro: 1,
    m: 1,
  });
  if (alcance !== null && tem(t, /\b(longe|distancia|alcance|ate)\b/))
    intent.alcance_m_desejado = alcance;

  // Carga: "carregue 20 kg".
  if (intent.finalidade === "carga") intent.carga_kg = medida(t, "kg|quilos?", { kg: 1, quilo: 1 });

  // Câmera.
  const aoVivo = tem(
    t,
    /\b(ao vivo|tempo real|fpv|transmiss\w*|ver o que o drone ve|camera ao vivo)\b/,
  );
  const gravar = intent.finalidade === "filmar" || tem(t, /\b(grav\w*|fotos?)\b/);
  intent.camera =
    aoVivo && gravar
      ? "ao_vivo_e_gravar"
      : aoVivo
        ? "ao_vivo"
        : gravar
          ? "gravar"
          : "nao_informado";

  if (tem(t, /\bgps\b/)) intent.gps = true;
  if (
    tem(
      t,
      /\b(volt\w* sozinho|retorno automatico|volt\w* para casa|volt\w* pra casa|rtl|return to home|volt\w* (para o|pro) ponto)\b/,
    )
  )
    intent.retorno_automatico = true;
  if (tem(t, /\b(estabiliz\w*|estavel|imagem firme)\b/)) intent.estabilizacao = true;
  if (
    tem(
      t,
      /\b(control\w*|pilot\w*|comand\w*)\b.{0,25}\b(pelo|com o|no) (celular|smartphone|telefone)\b/,
    )
  )
    intent.controle_pelo_celular = true;
  if (tem(t, /\b(iphone|ios)\b/)) intent.celular = "ios";
  else if (tem(t, /\bandroid\b/)) intent.celular = "android";
  if (tem(t, /\b(rapido|velocidade|veloz)\b/)) intent.quer_velocidade = true;
  if (
    tem(
      t,
      /\b(casamentos?|eventos?|clientes?|trabalho|profissional|comercial|vender|servico|pago)\b/,
    )
  )
    intent.uso_comercial = true;
  if (tem(t, /\b(casamentos?|festas?|eventos?|shows?|multidao|pessoas)\b/))
    intent.perto_de_pessoas = true;
  if (tem(t, /\b(pequen\w*|mini|micro|tiny|whoop)\b/)) intent.pequeno = true;
  if (tem(t, /\bja tenho (as |um |o )?(ferramentas|ferro de solda)\b/))
    intent.ja_tem_ferramentas = true;

  return sanitizeIntent(intent);
}
