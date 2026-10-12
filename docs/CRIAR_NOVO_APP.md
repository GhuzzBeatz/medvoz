# Criar um novo aplicativo GHZ

Este roteiro e a porta de entrada para criar um aplicativo novo ja com o padrao atual do MesaUp.

## 1. Defina a identidade

Antes de escrever codigo, escolha e nao altere depois da primeira publicacao:

- nome comercial;
- `appId` em minusculas;
- prefixo da licenca;
- `build.appId` do Electron;
- nome do instalador;
- nome da Edge Function OAuth;
- prefixo das tabelas do cliente;
- URL fixa do atualizador.

Preencha `app.config.js` e copie `supabase/app-cloud.config.example.json` para um arquivo de planejamento do novo app. Nao coloque segredo nesse arquivo.

## 2. Comece pelo aplicativo local

O app precisa continuar funcionando mesmo sem Supabase:

1. use a estrutura Electron deste repositorio;
2. mantenha a licenca antes da tela principal;
3. salve dados em uma pasta dentro de `app.getPath('userData')`;
4. nunca apague dados locais ao conectar a nuvem;
5. chame a sincronizacao depois de cada alteracao relevante.

## 3. Aplique a regra da licenca

- computador principal: pode entrar localmente;
- segundo ao quinto computador: precisa da mesma licenca e da mesma organizacao Supabase;
- organizacao diferente: bloquear;
- sexto computador: bloquear ate desativar outro dispositivo;
- conexao Supabase: opcional no primeiro computador, obrigatoria nos adicionais.

Leia `supabase/docs/08-licenca-e-multiplos-computadores.md` antes de implementar.

## 4. Configure o Supabase

1. crie o OAuth App no painel;
2. marque somente as permissoes descritas em `supabase/docs/07-oauth-dashboard-e-permissoes.md`;
3. crie a Edge Function broker no projeto central GHZ;
4. configure Client ID, Client Secret e Redirect URI como secrets;
5. prepare migration das sessoes, vinculos e dispositivos;
6. adapte as tabelas operacionais do app;
7. teste conta nova, conta existente, segundo computador e organizacao errada.

Use as implementacoes comprovadas em `supabase/references/mesaup/` e `supabase/references/medcore/`. Nao copie nomes, tabelas ou URLs sem adaptar.

## 5. Prepare o login simples

A tela deve mostrar:

- licenca ja preenchida quando foi usada antes;
- botao `Entrar` sempre visivel e exigindo clique;
- opcao `Conectar Supabase`;
- explicacao de que um computador funciona localmente;
- explicacao de que ate cinco computadores exigem a mesma conta/organizacao;
- mensagem clara quando a licenca pertence a outro computador;
- ajuda em video quando existir.

O processo principal e quem autoriza a entrada. O renderer apenas exibe e solicita a validacao.

## 6. Configure atualizacao

Siga `docs/DOWNLOADS_E_ATUALIZACOES.md`:

1. workflow de build e release;
2. instalador com nome fixo;
3. manifesto/endpoint fixo por `appId`;
4. hash SHA-256 do instalador;
5. teste do atualizador dentro do app.

## 7. Finalize

Antes de publicar:

```powershell
npm run check
git diff --check
git status --short
```

Confira tambem:

- nenhum secret no frontend;
- nenhum token em log;
- nenhuma tabela sem RLS quando exposta;
- dados locais antigos enviados sem serem apagados;
- licenca e auto-update preservados;
- login do segundo computador realmente bloqueado sem Supabase.
