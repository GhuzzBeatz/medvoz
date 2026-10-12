# 09 - Fluxo completo e testes reais

## Ordem de implementacao

1. preservar banco local atual;
2. validar licenca no processo principal;
3. criar migration central de sessoes, vinculos e dispositivos;
4. criar OAuth App e scopes;
5. configurar secrets da Edge Function;
6. adaptar e fazer deploy do broker;
7. integrar cliente OAuth no Electron;
8. criar tela de login em dois passos;
9. integrar push/pull em cada operacao local;
10. testar e somente depois publicar update.

## O broker faz sozinho

- abre login Supabase no navegador;
- recebe callback com PKCE;
- lista organizacoes autorizadas;
- reutiliza organizacao/projeto vinculado;
- cria projeto quando realmente nao existe;
- espera o banco ficar pronto;
- executa SQL inicial/idempotente;
- obtem chave publica/publishable;
- registra vinculo e dispositivo;
- devolve ao app apenas dados publicos necessarios.

O cliente nunca digita Project URL, anon key, senha tecnica ou SQL.

## Primeira sincronizacao

Quando ja existem dados locais:

1. baixar dados remotos;
2. mesclar por identificador estavel;
3. preservar dados locais em conflitos iniciais;
4. enviar o conjunto mesclado;
5. nunca substituir um arquivo local inteiro por uma resposta vazia;
6. registrar erro por tabela sem apagar o que ja foi sincronizado.

## Matriz de testes

| Cenario | Resultado esperado |
| --- | --- |
| Primeiro PC sem Supabase | entra e trabalha localmente |
| Primeiro PC conecta Supabase | projeto/tabelas criados e dados antigos enviados |
| Reconectar no mesmo PC | reutiliza projeto, nao duplica organizacao |
| Segundo PC offline | bloqueado e orientado a conectar Supabase |
| Segundo PC na mesma organizacao | registrado e dados sincronizados |
| Segundo PC em outra organizacao | bloqueado por conflito |
| Sexto PC | bloqueado pelo limite |
| Conta Supabase nova | usuario conclui criacao inicial e tenta novamente se necessario |
| Internet cai depois do login | app continua local e sincroniza depois |
| Tabela ja existe | setup idempotente conclui sem apagar dados |
| Scope ausente | erro legivel, sem expor token |
| Atualizacao oficial | instalador, manifesto e hash conferidos |

## Antes do commit

```powershell
npm test
git diff --check
rg -n "sb_secret_|sbp_|ghp_|service_role|client_secret|OPENAI_API_KEY" .
```

Resultados de busca em documentacao e chamadas `Deno.env.get(...)` sao permitidos. Valores reais nao sao.
