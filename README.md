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

**Status:** Fase 0 (fundação) concluída. Ainda não é possível criar projetos; o domínio (catálogo,
cálculos, compatibilidade) é a Fase 1.

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

Prefira uma pasta com caminho curto (o Windows tem limite de tamanho de caminho):

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

---

## Scripts

Todos funcionam igual no PowerShell, no cmd, no macOS e no Linux (há um teste automático que
recusa scripts com sintaxe só de bash).

| Comando                  | O que faz                                                             |
| ------------------------ | --------------------------------------------------------------------- |
| `pnpm dev`               | Abre o app em modo de desenvolvimento em http://localhost:3000.       |
| `pnpm build`             | Gera a versão otimizada (também confere os tipos).                    |
| `pnpm start`             | Roda a versão gerada pelo `build`.                                    |
| `pnpm test`              | Testes de unidade (Vitest).                                           |
| `pnpm test:watch`        | Testes de unidade, rodando de novo a cada alteração.                  |
| `pnpm test:e2e`          | Testes no navegador (Playwright); sobe o app sozinho.                 |
| `pnpm test:e2e:install`  | Baixa o Chromium usado pelo Playwright (uma vez só).                  |
| `pnpm lint`              | ESLint (falha com qualquer aviso).                                    |
| `pnpm lint:fix`          | ESLint corrigindo o que for automático.                               |
| `pnpm typecheck`         | Gera os tipos das rotas do Next e roda `tsc --noEmit`.                |
| `pnpm format`            | Formata tudo com o Prettier.                                          |
| `pnpm format:check`      | Só confere a formatação.                                              |
| `pnpm check`             | Formatação + lint + tipos + testes de unidade.                        |
| `pnpm shadcn add <nome>` | Adiciona um componente do shadcn/ui (ex.: `pnpm shadcn add tooltip`). |

## Problemas comuns no Windows

- **"a execução de scripts foi desabilitada neste sistema"**: faça o passo 3.
- **`pnpm` (ou `node`) "não é reconhecido"**: feche e abra o PowerShell depois de instalar.
- **Porta 3000 ocupada**: `pnpm dev --port 3001` e abra <http://localhost:3001>.
- **`pnpm install` lento**: antivírus examinando milhares de arquivos pequenos. É normal na
  primeira vez; as próximas usam o cache do pnpm.
- **Erros de caminho muito longo**: clone em uma pasta curta, como `C:\dev\from-scratch`.
- **Playwright reclama que falta o navegador**: rode `pnpm test:e2e:install`.

## Privacidade

- O Next.js coleta telemetria anônima de uso por padrão. Para desligar neste computador:
  `pnpm exec next telemetry disable`.
- A partir da Fase 4, o texto dos seus pedidos e as fotos enviadas ao tutor vão para a API da
  Anthropic (Claude). A chave fica só no servidor local, nunca no navegador.

## Estrutura

```
docs/           especificação, decisões, progresso e glossário
src/app/        páginas e rotas do Next.js
src/components/ componentes de interface (ui/ = shadcn/ui)
src/domain/     regras de engenharia em TypeScript puro (a partir da Fase 1)
src/server/     LLM, banco, uploads e orçamento (a partir das Fases 1 e 4)
tests/          testes de unidade (unit/) e de navegador (e2e/)
```
