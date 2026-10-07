import { beforeEach, describe, expect, it } from "vitest";

import { clearMemo, memo, memoSize } from "./memo";

describe("memória das contas do servidor", () => {
  beforeEach(() => clearMemo());

  it("calcula uma vez por chave e devolve o mesmo valor depois", () => {
    let vezes = 0;
    const calcular = () => {
      vezes++;
      return { valor: 42 };
    };
    const a = memo("x", calcular);
    const b = memo("x", calcular);
    expect(vezes).toBe(1);
    expect(b).toBe(a);
    memo("y", calcular);
    expect(vezes).toBe(2);
  });

  it("tem limite: a chave usada há mais tempo sai primeiro", () => {
    for (let i = 0; i < 96; i++) memo(`k${i}`, () => i);
    memo("k0", () => -1); // k0 foi usada agora: a mais antiga passa a ser k1
    memo("nova", () => 0);
    expect(memoSize()).toBe(96);
    let recalculou = false;
    memo("k0", () => {
      recalculou = true;
      return -2;
    });
    expect(recalculou).toBe(false);
    memo("k1", () => {
      recalculou = true;
      return -3;
    });
    expect(recalculou).toBe(true);
  });
});
