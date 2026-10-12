# Supabase Base APP - Padrao GHZ Plugin

Modulo oficial do repositorio unico `GHZ_APP_STANDARD` para integrar aplicativos desktop da GHZ Plugin com o Supabase do proprio cliente.

Este repositorio serve como documentacao e molde reutilizavel para apps como MesaUp, MedCore, FolhaPro, ZapBot, ZapDisparo e novos produtos.

## Objetivo

Permitir que cada cliente conecte o aplicativo na propria conta Supabase, mantendo os dados operacionais sob responsabilidade dele, enquanto a GHZ Plugin mantem apenas a parte de licenciamento, atualizacao e suporte.

## Ideia principal

- O app desktop continua funcionando localmente.
- Quando o cliente conecta o Supabase, o app sincroniza os dados com o projeto Supabase do cliente.
- A GHZ Plugin nao guarda os dados operacionais do cliente.
- O app nunca recebe `service_role`, client secret, senha do banco ou token sensivel.
- O app usa somente a URL do projeto do cliente e uma chave publica/anon.
- A parte sensivel de OAuth, criacao do projeto e setup das tabelas fica em uma Edge Function/broker no projeto GHZ.

## Quando usar

Use esta base quando quiser adicionar em um app:

- backup em nuvem;
- sincronizacao entre computadores;
- painel do dono pelo celular;
- dashboard web externo;
- pedidos online sincronizados;
- dados do cliente no Supabase dele;
- modo local + modo nuvem opcional.

## Estrutura

| Caminho | Conteudo |
| --- | --- |
| `docs/01-arquitetura.md` | Visao geral da arquitetura recomendada |
| `docs/02-seguranca-e-segredos.md` | Regras de seguranca, chaves e o que nunca expor |
| `docs/03-passo-a-passo-integracao.md` | Passo a passo para aplicar em qualquer app |
| `docs/04-modelo-de-dados-e-sync.md` | Modelo de tabelas, JSONB, push/pull e conflitos |
| `docs/05-checklist-por-app.md` | Checklist antes de publicar uma integracao |
| `docs/06-mesaup-plano.md` | Ideias especificas para MesaUp com Supabase do cliente |
| `docs/07-oauth-dashboard-e-permissoes.md` | OAuth App, redirect URI e scopes exatos |
| `docs/08-licenca-e-multiplos-computadores.md` | Primeiro PC local e ate cinco PCs pela mesma organizacao |
| `docs/09-fluxo-completo-e-testes.md` | Ordem de implementacao e matriz de testes reais |
| `templates/` | Moldes de broker, sync, SQL e prompt |
| `references/` | Implementacoes funcionais do MesaUp e MedCore |

## Regra de ouro

Nunca coloque segredos reais neste repositorio.

Permitido:

- nomes de variaveis;
- placeholders;
- exemplos falsos;
- fluxo de arquitetura;
- SQL generico;
- codigo template sem segredo.

Proibido:

- `service_role` real;
- client secret real;
- token GitHub real;
- chave OpenAI/Gemini real;
- senha de banco;
- dados reais de clientes.

## Fluxo rapido

1. Leia `docs/01-arquitetura.md`.
2. Confira `docs/02-seguranca-e-segredos.md`.
3. Siga `docs/03-passo-a-passo-integracao.md`.
4. Use os templates em `templates/`.
5. Antes de publicar, rode o checklist em `docs/05-checklist-por-app.md`.
6. Para novos apps, leia tambem `../docs/CRIAR_NOVO_APP.md`.

## Prompt pronto

Para pedir para uma IA implementar em um app, use:

`templates/prompts/prompt-integrar-app.md`
