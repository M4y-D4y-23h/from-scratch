/*
 * Memória das contas do servidor (desempenho). O motor de cálculo é determinístico: com o mesmo
 * catálogo (hash) e a mesma escolha de peças, o resultado é sempre o mesmo. Guardar o resultado
 * evita refazer o solver e as 35 regras a cada visita. Quando o catálogo muda, o hash muda: as
 * chaves antigas deixam de ser pedidas e saem pelo limite de tamanho (as menos usadas primeiro).
 *
 * Quem recebe um valor da memória NÃO pode alterá-lo: o mesmo objeto atende a próxima visita.
 */

const LIMITE = 96;
const memoria = new Map<string, unknown>();

export function memo<T>(chave: string, calcular: () => T): T {
  if (memoria.has(chave)) {
    const valor = memoria.get(chave) as T;
    // Usado agora: vai para o fim da fila (a primeira da fila é a próxima a sair).
    memoria.delete(chave);
    memoria.set(chave, valor);
    return valor;
  }
  const valor = calcular();
  memoria.set(chave, valor);
  if (memoria.size > LIMITE) {
    const maisAntiga = memoria.keys().next();
    if (!maisAntiga.done) memoria.delete(maisAntiga.value);
  }
  return valor;
}

/** Quantas contas estão guardadas (para testes). */
export function memoSize(): number {
  return memoria.size;
}

/** Esquece tudo (para testes). */
export function clearMemo(): void {
  memoria.clear();
}
