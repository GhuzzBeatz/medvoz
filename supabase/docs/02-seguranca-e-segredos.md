# 02 - Seguranca, Segredos e Responsabilidades

## Regra principal

O app desktop nunca deve conter segredos administrativos.

Nunca colocar no app:

- `service_role`;
- client secret OAuth;
- senha do banco;
- token GitHub;
- API key privada de IA;
- token de pagamento;
- credenciais do painel Supabase.

## O que pode ficar no app

Pode ficar no app:

- URL do projeto Supabase do cliente;
- anon key/public key do projeto do cliente;
- identificador do app;
- URL do broker;
- URL do manifesto de atualizacao;
- dados locais do proprio cliente.

A anon key e publica, mas ainda assim deve ser tratada com cuidado. Ela so deve acessar tabelas protegidas por RLS ou tabelas do projeto exclusivo daquele cliente.

## Onde ficam os segredos

| Item | Onde deve ficar |
| --- | --- |
| `SB_OAUTH_CLIENT_SECRET` | Secrets da Edge Function |
| `SUPABASE_SERVICE_ROLE_KEY` | Ambiente do projeto GHZ, somente servidor |
| Token GitHub para release privada | Secrets da Edge Function ou GitHub Actions |
| API OpenAI/Gemini | Servidor, Edge Function ou backend local seguro, nunca no renderer publico |
| Senha de banco | Nunca no app |

## RLS

Toda tabela exposta no Supabase deve ter RLS ativado.

Quando o projeto e exclusivo do cliente e o app usa anon key, pode existir uma policy ampla para `anon`, mas apenas se:

- o banco e realmente do proprio cliente;
- a anon key pertence ao projeto do cliente;
- nao existe dado de outro cliente nesse projeto;
- o termo de responsabilidade deixa isso claro.

Exemplo simples para projeto exclusivo do cliente:

```sql
alter table public.mu_mesas enable row level security;
create policy mu_mesas_anon_all
on public.mu_mesas
for all
to anon
using (true)
with check (true);
```

Para banco compartilhado entre clientes, isso NAO serve. Banco compartilhado exige `tenant_id`, Auth e policies restritas por usuario/empresa.

## Checklist contra vazamento

Antes de commitar, procurar por:

- `service_role`
- `sb_secret_`
- `sbp_`
- `sk-`
- `ghp_`
- `password`
- `client_secret`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`

Comando recomendado:

```powershell
rg -n "service_role|sb_secret_|sbp_|sk-|ghp_|password|client_secret|OPENAI_API_KEY|GEMINI_API_KEY" .
```

Se aparecer apenas documentacao explicando placeholders, ok. Se aparecer valor real, remover antes do commit.

## Termo para o cliente

O app deve explicar ao cliente:

- os dados serao armazenados no Supabase conectado por ele;
- a conta Supabase e de responsabilidade dele;
- limites, plano, cobranca e disponibilidade do Supabase sao responsabilidade do cliente;
- a GHZ Plugin nao deve acessar dados operacionais sem autorizacao;
- desconectar a conta pode interromper sincronizacao entre dispositivos.

## Recuperacao e suporte

Para suporte, o app pode mostrar:

- conta conectada;
- URL do projeto;
- data da conexao;
- status do ultimo sync;
- erro resumido.

Nunca mostrar:

- anon key completa;
- service_role;
- client secret;
- tokens OAuth.
