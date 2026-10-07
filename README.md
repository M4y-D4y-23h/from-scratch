# From Scratch

Aplicação web local que transforma um pedido em linguagem natural ("quero um drone simples com GPS
e câmera ao vivo") em um **projeto real e honesto**: peças reais em 3D e em escala, custos em
reais, dificuldade por área de conhecimento, onde fazer cada coisa, riscos e um guia de montagem
com tutor. Na v1, só **drones multirrotores**.

> **Regra de ouro:** a ferramenta nunca mente para ser encorajadora. Se um projeto não voaria,
> custaria mais do que o orçamento ou for perigoso, ela diz isso com números.

- Especificação completa: [`docs/SPEC.md`](docs/SPEC.md)
- Decisões técnicas (e o porquê): [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Andamento por fase: [`docs/PROGRESS.md`](docs/PROGRESS.md)

**Status:** Fases 0 a 3 concluídas. Os três drones de referência já abrem com 3D em escala,
custos, dificuldade, onde fazer, segurança e cálculos, e dá para trocar peças com tudo recalculado
(salvando como projeto, com versões). O pedido em linguagem natural (com IA) é a Fase 4.

---

## Como rodar no Windows (passo a passo)

Os comandos abaixo são para o **PowerShell** (menu Iniciar → digite "PowerShell"). Copie e cole
uma linha por vez.

### 1. Instale o Git

```powershell
winget install --id Git.Git -e
```

Sem `winget`? Baixe o instalador em <https://git-scm.com/download/win> e aceite as opções padrão.

### 2. Instale o Node.js (versão LTS, hoje a 24)

```powershell
winget install --id OpenJS.NodeJS.LTS -e
```

Sem `winget`? Baixe o instalador **LTS** em <https://nodejs.org>.

**Feche e abra o PowerShell de novo** e confira:

```powershell
node -v   # deve mostrar v24.x.x
```

### 3. Permita que o PowerShell rode os atalhos do npm/pnpm

O Windows bloqueia scripts `.ps1` por padrão, e o `npm`/`pnpm` instalam atalhos desse tipo. Este
comando libera **só para o seu usuário** scripts locais e scripts assinados baixados da internet:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

Responda `S` (Sim) se ele perguntar.

### 4. Instale o pnpm

```powershell
npm install --global pnpm@latest-11
pnpm -v
```

O projeto fixa a versão exata do pnpm no `package.json` (`packageManager`). Se a sua versão for
diferente, o próprio pnpm baixa e usa a versão certa automaticamente.

### 5. Baixe o projeto

Use uma pasta com caminho curto (o Windows tem limite de tamanho de caminho) num disco **NTFS**,
como o `C:`. Pendrive, HD externo ou cartão formatados em FAT32 ou exFAT, e unidades de rede ou de
nuvem, não servem: o `pnpm install` precisa criar atalhos de pasta que esses discos não aceitam.

```powershell
git clone https://github.com/M4y-D4y-23h/from-scratch.git C:\dev\from-scratch
cd C:\dev\from-scratch
```

### 6. Instale as dependências

```powershell
pnpm install
```

Nenhuma dependência precisa ser compilada: tudo que é nativo vem pré-compilado para Windows (não
precisa do Visual Studio Build Tools).

### 7. Crie o seu arquivo de configuração local

```powershell
Copy-Item .env.example .env.local
```

O `.env.local` **nunca** vai para o git. A chave da API do Claude (`ANTHROPIC_API_KEY`) só será
necessária a partir da Fase 4; por enquanto pode deixar em branco.

### 8. Rode

```powershell
pnpm dev
```

Abra <http://localhost:3000> no navegador. Para parar, volte ao PowerShell e aperte `Ctrl + C`.

O app só atende o próprio computador (escuta em 127.0.0.1): ele grava os arquivos do catálogo, e
ninguém na sua rede deve conseguir fazer isso.

**Versão rápida (para usar o app):** `pnpm dev` compila cada página na primeira visita e roda o
React na versão de desenvolvimento, o que deixa tudo mais lento. Para só usar o app, prefira:

```powershell
pnpm app
```

Ele compila tudo de uma vez (cerca de 1 minuto; as próximas vezes reaproveitam o cache) e abre a
versão otimizada em <http://localhost:3000>: as páginas abrem e as abas trocam bem mais rápido.
Mudanças no código só valem quando você rodar de novo.

**Pelo VS Code (F5):** abra a pasta do projeto no VS Code (aceite instalar as extensões
recomendadas) e:

1. Pare o `pnpm dev` do terminal, se estiver rodando (os dois disputariam a porta 3000).
2. Aperte **F5**. A opção padrão, **"Usar o app (versão rápida)"**, roda o `pnpm install` e o
   `pnpm build` e abre o app no seu navegador quando ele fica pronto.
3. **Shift + F5** encerra.

No painel "Executar e Depurar" (`Ctrl + Shift + D`) há também **"Desenvolver (recompila ao salvar,
com depurador)"**: recompila a cada arquivo salvo e abre o Edge conectado ao depurador (clique à
esquerda do número de uma linha para o app parar ali). É mais lento; use quando for mexer no código.
E ainda "Só o servidor" e "Só o navegador". A configuração fica em `.vscode/launch.json`.

### 9. Rode as verificações (opcional, mas é o que roda antes de cada commit)

```powershell
pnpm test        # testes de unidade (Vitest)
pnpm lint        # ESLint
pnpm typecheck   # TypeScript
pnpm check       # tudo acima + formatação, de uma vez
```

Testes de ponta a ponta no navegador (Playwright). Na primeira vez, baixe o Chromium de teste:

```powershell
pnpm test:e2e:install
pnpm test:e2e
```

Eles sobem um servidor separado (porta 3100) com uma cópia do catálogo e um banco temporário: não
mexem nos seus arquivos nem nos seus projetos, e podem rodar com o `pnpm dev` aberto.

---

## O que já dá para fazer

- **Página inicial:** os três drones de referência (GPS para filmar, FPV 5" e Tiny Whoop), cada um
  em três faixas de preço, e os seus projetos.
- **Página do drone:** resumo, 3D em escala real e as abas Peças e Custos, Dificuldade, Onde fazer,
  Montagem, Segurança e Cálculos. Termos técnicos sublinhados abrem a explicação num balão.
- **Trocar peça:** "Trocar" mostra só as alternativas que passam nas regras, com a diferença de
  custo, peso e tempo de voo. A troca cria o seu projeto, com versões (dá para voltar a qualquer
  uma).
- **Catálogo (`/catalogo`):** peças, ferramentas, tabelas de empuxo e drones prontos, com busca e
  filtros. Dá para marcar como verificado (com a fonte), salvar preço com data e editar o JSON de
  cada item. **As mudanças vão para os arquivos em `data/catalog/drone/`:** confira com `git diff`
  e faça commit (ou desfaça com `git checkout -- data/catalog`).
- **Glossário (`/glossario`):** todos os termos técnicos, explicados de um jeito simples.

---

## Scripts

Todos funcionam igual no PowerShell, no cmd, no macOS e no Linux (há um teste automático que
recusa scripts com sintaxe só de bash).

| Comando                  | O que faz                                                              |
| ------------------------ | ---------------------------------------------------------------------- |
| `pnpm dev`               | Abre o app em http://localhost:3000 (só para este computador).         |
| `pnpm build`             | Gera a versão otimizada (também confere os tipos).                     |
| `pnpm start`             | Roda a versão gerada pelo `build`.                                     |
| `pnpm app`               | `build` + `start`: a versão rápida, para usar o app.                   |
| `pnpm test`              | Testes de unidade (Vitest).                                            |
| `pnpm test:watch`        | Testes de unidade, rodando de novo a cada alteração.                   |
| `pnpm test:e2e`          | Testes no navegador (Playwright), num servidor separado.               |
| `pnpm test:e2e:install`  | Baixa o Chromium usado pelo Playwright (uma vez só).                   |
| `pnpm lint`              | ESLint (falha com qualquer aviso).                                     |
| `pnpm lint:fix`          | ESLint corrigindo o que for automático.                                |
| `pnpm typecheck`         | Gera os tipos das rotas do Next e roda `tsc --noEmit`.                 |
| `pnpm format`            | Formata tudo com o Prettier.                                           |
| `pnpm format:check`      | Só confere a formatação.                                               |
| `pnpm check`             | Formatação + lint + tipos + testes de unidade.                         |
| `pnpm shadcn add <nome>` | Adiciona um componente do shadcn/ui (ex.: `pnpm shadcn add tooltip`).  |
| `pnpm report`            | Mostra os 9 builds de referência no terminal (`pnpm report a1`).       |
| `pnpm catalog:check`     | Confere o catálogo e o glossário.                                      |
| `pnpm catalog:format`    | Deixa os JSON do catálogo no formato que a página /catalogo grava.     |
| `pnpm db:sync`           | Cria/atualiza o banco local (`data/local/`); o app também faz sozinho. |
| `pnpm db:generate`       | Gera uma migração do banco (para quem mexe no schema).                 |

## Problemas comuns no Windows

- **"a execução de scripts foi desabilitada neste sistema"**: faça o passo 3.
- **`pnpm` (ou `node`) "não é reconhecido"**: feche e abra o PowerShell depois de instalar.
- **Porta 3000 ocupada**: `pnpm dev --port 3001` e abra <http://localhost:3001>.
- **`pnpm install` lento**: antivírus examinando milhares de arquivos pequenos. É normal na
  primeira vez; as próximas usam o cache do pnpm.
- **Erros de caminho muito longo**: clone em uma pasta curta, como `C:\dev\from-scratch`.
- **Playwright reclama que falta o navegador**: rode `pnpm test:e2e:install`.
- **"Cannot find module ...\node_modules\next\..."**: as dependências não foram instaladas nessa
  pasta. Rode `pnpm install` no terminal do VS Code (o F5 já faz isso antes de subir o app).
- **`ERR_PNPM_EISDIR ... symlink` no `pnpm install`**: o projeto está num disco que não aceita os
  atalhos de pasta do pnpm (FAT32 ou exFAT, comum em pendrive e HD externo, ou unidade de rede ou
  de nuvem). Confira com `(Get-Volume -DriveLetter F).FileSystem` (troque o `F` pela letra do
  disco) e clone o projeto num disco NTFS, como em `C:\dev\from-scratch` (passo 5).
- **Não abre pelo celular na mesma rede**: é de propósito; o app só atende o próprio computador.
- **"Não consegui gravar ... (EPERM)" no /catalogo**: o arquivo está aberto ou preso por outro
  programa (antivírus, editor). Feche-o e salve de novo; o catálogo não foi alterado.

## Privacidade

- O Next.js coleta telemetria anônima de uso por padrão. Para desligar neste computador:
  `pnpm exec next telemetry disable`.
- A partir da Fase 4, o texto dos seus pedidos e as fotos enviadas ao tutor vão para a API da
  Anthropic (Claude). A chave fica só no servidor local, nunca no navegador.

## Estrutura

```
docs/               especificação, decisões, progresso e glossário
data/catalog/drone/ catálogo curado (peças, empuxo, ferramentas, arquétipos), versionado no git
src/app/            páginas e rotas do Next.js
src/components/     componentes de interface (ui/ = shadcn/ui)
src/domain/         regras de engenharia em TypeScript puro (cálculos, regras, solver, 3D)
src/server/         banco, catálogo, projetos e ações; LLM, uploads e orçamento a partir da Fase 4
scripts/            scripts do terminal (report, catalog:check, servidor dos testes)
tests/              testes de unidade (unit/) e de navegador (e2e/)
```
