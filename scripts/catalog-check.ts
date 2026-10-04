/*
 * Confere o catálogo (data/catalog/drone) e o glossário (docs/GLOSSARIO.md) sem abrir o banco.
 * Uso: pnpm catalog:check   (sai com código 1 se houver problema)
 */
import { missingRelatedTerms } from "@/domain/core/glossary";
import { CatalogError, loadDroneCatalog } from "@/server/catalog/load";
import { loadGlossary } from "@/server/glossary/load";

let ok = true;

try {
  const { catalog, arquivos } = loadDroneCatalog();
  console.log(
    `Catálogo OK: ${arquivos.length} arquivo(s), ${catalog.componentes.length} peça(s), ` +
      `${catalog.empuxo.length} tabela(s) de empuxo, ${catalog.ferramentas.length} ferramenta(s), ` +
      `${catalog.arquetipos.length} arquétipo(s), ${catalog.perfis_firmware.length} perfil(is) de firmware.`,
  );
} catch (error) {
  if (!(error instanceof CatalogError)) throw error;
  console.error(error.message);
  ok = false;
}

const glossario = loadGlossary();
const faltando = missingRelatedTerms(glossario.termos);
for (const problema of glossario.problemas) console.error(`Glossário: ${problema}`);
if (faltando.length > 0)
  console.error(`Glossário: termos relacionados sem verbete: ${faltando.join(", ")}`);
if (glossario.problemas.length > 0 || faltando.length > 0) ok = false;
else console.log(`Glossário OK: ${glossario.termos.length} termo(s).`);

process.exitCode = ok ? 0 : 1;
