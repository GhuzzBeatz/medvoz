# Seguranca e segredos

Este repositorio pode ser publico ou compartilhado como referencia. Por isso, ele nunca deve conter dados sensiveis.

## Pode documentar

- Nome dos servicos usados.
- Arquitetura geral.
- Nome publico dos apps.
- `appId` publico.
- URLs publicas de pagina de download.
- Endpoints publicos que usam chave anon/publishable.
- Fluxos de licenca e update.
- Como rodar testes e build.

## Nao pode documentar

- Senhas administrativas.
- Tokens privados de GitHub.
- Service role keys do Supabase.
- Secrets de Edge Functions.
- Chaves privadas de Mercado Livre, Google, YouTube, X/Twitter ou outros servicos.
- Arquivos `.env`.
- Credenciais pessoais.
- Chaves reais de clientes.
- Tokens salvos em navegador.

## Regra para downloads privados

Se o instalador esta em repositorio privado, o app instalado e o HTML venda nao devem ter token privado. O token fica apenas no backend/proxy/Edge Function.

Fluxo correto:

```text
Cliente/app -> pagina fixa ou endpoint publico -> backend/proxy -> GitHub Release privado
```

Fluxo proibido:

```text
Cliente/app -> GitHub privado com token embutido no frontend
```

## Antes de commitar

Rodar uma revisao rapida:

```powershell
git diff --cached
```

Procurar manualmente por:

```text
token
secret
password
senha
service_role
GITHUB_RELEASE_TOKEN
.env
```

Se algum segredo aparecer, remover antes do commit.
