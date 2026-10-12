# Padrao GHZ para Ajuda IA com OpenAI

Este padrao deve ser usado em todos os aplicativos GHZ que tiverem chat com IA.

## Regra principal

A chave da OpenAI nunca deve ficar no aplicativo desktop, HTML, JavaScript do cliente, GitHub, instalador, `app.config.js`, `main.js`, `preload.js`, `services/*` ou `.env.local` dentro da pasta do app.

O fluxo correto e sempre:

1. O aplicativo abre a tela interna `pages/ajuda_ia.html`.
2. O renderer envia a pergunta para o processo principal pelo `preload.js`/IPC seguro.
3. O processo principal chama uma Supabase Edge Function do aplicativo.
4. A Edge Function valida a licenca/cliente/dispositivo antes de responder.
5. A Edge Function le `OPENAI_API_KEY` exclusivamente de Supabase Secrets.
6. A Edge Function chama a OpenAI e retorna apenas a resposta final para o app.

## Onde configurar a chave

Configure `OPENAI_API_KEY` no painel do Supabase em:

Project Settings > Edge Functions > Secrets

Ou pelo ambiente seguro equivalente do Supabase. Nao crie arquivo local com a chave no projeto do aplicativo.

## O que nao perguntar ao usuario

Nao pergunte:

- "Posso salvar a chave em `.env.local`?"
- "Posso colocar a chave no projeto local?"
- "Posso colocar a chave no Electron?"
- "Posso colocar a chave no GitHub?"

A resposta padrao para futuros apps e: usar Supabase Secret. Se o segredo nao existir, orientar o usuario a criar/rotacionar a chave e salvar somente no Supabase Secret.

## Segurança obrigatoria

- Nunca commitar chaves, tokens ou secrets.
- Nunca embutir `sk-` ou `sk-proj-` no codigo.
- Nunca expor service role no app cliente.
- Nunca chamar OpenAI diretamente do renderer.
- Nunca liberar IA sem validar a licenca do app.
- Limitar tamanho da pergunta e historico enviado.
- Criar limite de uso por licenca/cliente quando o app for vendido para varios usuarios.
- Tratar falha de rede como erro fechado: se nao validou, nao responde.

## Modelo recomendado de Edge Function

Cada app deve ter sua propria funcao, por exemplo:

- `folhapro-ai-support`
- `nexhotel-ai-support`
- `medcore-ai-support`
- `mesaup-ai-support`

A funcao deve:

1. Ler `OPENAI_API_KEY` via `Deno.env.get('OPENAI_API_KEY')`.
2. Ler `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no backend.
3. Validar a licenca no banco antes de chamar a OpenAI.
4. Usar uma base de conhecimento nao confidencial do aplicativo.
5. Bloquear perguntas sobre chaves, banco, codigo-fonte, GitHub, Supabase, licenca ou formas de burlar o sistema.
6. Responder em portugues do Brasil, de forma curta e pratica.

## Texto padrao para responder ao usuario

Quando o usuario perguntar como a IA sera configurada, responda:

"A IA sera conectada pelo backend seguro do Supabase. A chave da OpenAI deve ficar somente em Supabase Secrets como `OPENAI_API_KEY`. O aplicativo nao salva essa chave em `.env.local`, nao coloca no GitHub e nao envia a chave para o Electron. O app chama uma Edge Function, e essa funcao valida a licenca antes de consultar a OpenAI."

## Quando uma chave for colada no chat

Se uma chave OpenAI for colada em uma conversa, trate como exposta:

1. Nao repita a chave.
2. Oriente a revogar/rotacionar a chave.
3. Configure apenas uma nova chave segura em Supabase Secrets.
4. Continue a implementacao sem gravar a chave no codigo.
