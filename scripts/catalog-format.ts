/*
 * Reescreve os arquivos do catálogo no formato canônico (o mesmo que a página /catalogo grava):
 * assim uma edição feita pela página mostra no git só o que mudou.
 * Uso: pnpm catalog:format
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { CATALOG_ROOT, readCatalogFiles } from "@/server/catalog/load";
import { formatCatalogJson } from "@/server/catalog/write";

async function main() {
  let mudou = 0;
  for (const f of readCatalogFiles()) {
    const destino = path.join(CATALOG_ROOT, ...f.caminho.split("/"));
    const canonico = await formatCatalogJson(JSON.parse(f.conteudo));
    if (canonico === f.conteudo) continue;
    writeFileSync(destino, canonico, "utf8");
    mudou++;
    console.log(`Formatado: ${f.caminho}`);
  }
  console.log(
    mudou === 0
      ? "O catálogo já está no formato canônico."
      : `${mudou} arquivo(s) no formato canônico.`,
  );
}

void main();
