# 08 - Licenca e multiplos computadores

Esta regra impede que uma unica licenca seja revendida para pessoas diferentes e, ao mesmo tempo, permite que o cliente use seus dados em ate cinco computadores.

## Regra oficial

### Primeiro computador

- valida a licenca no backend GHZ;
- torna-se o computador principal da licenca;
- pode entrar sem conectar Supabase;
- pode conectar Supabase para ativar sincronizacao e liberar computadores adicionais.

### Segundo ao quinto computador

- informa a mesma licenca;
- nao pode entrar offline;
- precisa clicar em `Conectar Supabase`;
- precisa autorizar uma conta que tenha acesso a mesma organizacao vinculada a licenca;
- depois de registrado, pode entrar normalmente enquanto continuar ativo e validado.

### Organizacao diferente

Bloquear com mensagem simples:

```text
Esta licenca ja foi conectada a outra organizacao Supabase. Entre na mesma conta/organizacao usada antes ou fale com o suporte.
```

### Limite atingido

```text
Esta licenca ja esta conectada em 5 computadores. Fale com o suporte para remover um computador antigo.
```

## Dados centrais necessarios

O projeto central GHZ mantem, no minimo:

- tabela de licencas;
- sessoes OAuth temporarias;
- vinculo unico entre `app_id + license_hash` e organizacao/projeto;
- dispositivos autorizados por `app_id + license_hash + device_hash`;
- data do primeiro e ultimo acesso;
- campo ativo para revogacao.

Nunca guarde a licenca pura nas tabelas de broker. Use hash SHA-256 para vinculos e dispositivos.

## Decisoes obrigatorias do broker

1. validar a licenca antes de iniciar OAuth;
2. obter o `device_hash` do backend de licenca, nao confiar em valor inventado pelo renderer;
3. procurar vinculo existente da licenca;
4. se existir, selecionar somente aquela organizacao e aquele projeto;
5. se a conta autorizada nao enxergar a organizacao vinculada, bloquear;
6. reutilizar o projeto existente antes de criar outro;
7. registrar o dispositivo apenas depois de validar organizacao/projeto;
8. bloquear acima de cinco dispositivos ativos;
9. nunca transferir automaticamente uma licenca para outra organizacao.

## Fluxo de entrada

```text
Abrir app
  -> validar licenca e dispositivo
     -> computador principal: permitir botao Entrar
     -> dispositivo cloud ja registrado: permitir botao Entrar
     -> dispositivo desconhecido: exigir Conectar Supabase
        -> mesma organizacao/projeto: registrar e permitir
        -> organizacao diferente: bloquear
        -> limite de 5: bloquear
```

## Tela para usuario leigo

Use textos diretos:

```text
1. Use somente neste computador: digite sua licenca e clique em Entrar.
2. Use em mais computadores: conecte sua conta Supabase.
3. Nos outros computadores, use a mesma licenca e entre na mesma conta Supabase.
```

O aplicativo deve lembrar a licenca, mas sempre exigir que o usuario clique em `Entrar`, para que a opcao Supabase continue visivel.

## Referencia funcional

Veja:

- `references/mesaup/mesaup-client-cloud.ts`;
- `references/mesaup/broker.sql`;
- `references/mesaup/license-devices.sql`;
- `references/mesaup/client-cloud.js`.

Esses arquivos sao uma fotografia da implementacao validada. Para app novo, adapte `APP_ID`, nomes das tabelas, function slug, mensagens e prefixos.
