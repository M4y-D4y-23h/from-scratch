import { describe, expect, it } from "vitest";

import { isLocalHost } from "./local";

describe("gravações só do próprio computador", () => {
  it("aceita localhost, 127.0.0.1 e [::1], com ou sem porta", () => {
    for (const host of [
      "localhost",
      "localhost:3000",
      "127.0.0.1:3100",
      "[::1]:3000",
      "LOCALHOST",
    ]) {
      expect(isLocalHost(host), host).toBe(true);
    }
  });

  it("recusa IP da rede, outro nome (DNS rebinding) e ausência de Host", () => {
    for (const host of [
      "192.168.0.10:3000",
      "evil.example:3000",
      "localhost.evil.example",
      "",
      null,
    ]) {
      expect(isLocalHost(host), String(host)).toBe(false);
    }
  });
});
