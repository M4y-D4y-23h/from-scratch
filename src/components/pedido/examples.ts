/** Pedidos de exemplo (clicáveis) para quem não sabe por onde começar. */
export const PEDIDO_EXEMPLOS = [
  "quero um drone pequeno pra voar dentro de casa e aprender",
  "drone para filmar viagens, até R$ 2.000, que volte sozinho se perder o sinal",
  "drone simples com GPS, retorno automático, câmera ao vivo e que eu controle pelo celular",
  "drone de corrida bem rápido",
] as const;

/**
 * Chave do sessionStorage para enviar o pedido digitado na página inicial assim que /novo abrir.
 * Um link externo para /novo?pedido=... só preenche o campo: não gasta uma chamada da IA sozinho.
 */
export const AUTO_ENVIAR_KEY = "from-scratch:enviar-pedido";
