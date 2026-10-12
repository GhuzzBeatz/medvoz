# 04 - Modelo de Dados e Sincronizacao

## Modelo recomendado

Para apps desktop com JSON local, o formato mais simples e robusto e guardar cada colecao em uma tabela no Supabase.

Exemplo MesaUp:

- `mu_config`
- `mu_mesas`
- `mu_comandas`
- `mu_produtos`
- `mu_clientes`
- `mu_garcons`
- `mu_financeiro`
- `mu_fornecedores`
- `mu_pedidos_delivery`
- `mu_pedidos_mesa`

Cada tabela tem a mesma estrutura:

```sql
row_id text primary key,
record jsonb not null default '{}'::jsonb,
updated_at timestamptz not null default now(),
deleted_at timestamptz,
version bigint not null default 1,
source_client text
```

## Por que JSONB

Vantagens:

- reaproveita o formato local do app;
- evita criar centenas de colunas logo no inicio;
- facilita portar para apps diferentes;
- reduz chance de quebrar update antigo;
- permite sincronizacao generica.

Desvantagens:

- relatorios SQL complexos ficam mais trabalhosos;
- indices por campo exigem indices especificos;
- validacao forte fica no app, nao no banco.

Para MVP e apps desktop vendidos individualmente, o modelo JSONB e uma boa base.

## Metadados

### `row_id`

Identificador unico do registro. Deve ser estavel.

### `updated_at`

Data da ultima alteracao. Usada para sync incremental.

### `deleted_at`

Quando preenchido, indica exclusao logica. Nao apagar fisicamente por padrao.

### `version`

Numero incremental para ajudar conflito.

### `source_client`

Identifica o computador/dispositivo que gravou.

## Exclusao logica

Nunca apagar direto em sistemas comerciais sem historico.

Preferir:

```json
{
  "status": "excluida",
  "deleted_at": "2026-08-09T10:00:00Z"
}
```

Isso vale para:

- comandas;
- pedidos delivery;
- pedidos mesa;
- lancamentos financeiros;
- produtos;
- fornecedores.

## Conflitos

Regra simples:

1. Maior `version` vence.
2. Se `version` for igual, maior `updated_at` vence.
3. Em casos financeiros, evitar sobrescrever silenciosamente. Preferir registro de evento.

## Dados financeiros

Para financeiro, e melhor usar modelo de eventos:

- receita registrada;
- despesa registrada;
- sangria;
- suprimento;
- pagamento parcial;
- cancelamento;
- estorno.

Evitar editar valor antigo sem historico.

## Periodicidade de sync

Recomendacao inicial:

- push com debounce de 600ms apos alteracao;
- pull a cada 4 a 10 segundos se tela operacional estiver aberta;
- pull a cada 30 segundos para dashboard/painel externo;
- botao `Sincronizar agora` em Configuracoes.

## Falha de internet

Se a internet cair:

- o app continua local;
- mostrar aviso discreto;
- guardar fila local;
- tentar novamente depois;
- nao bloquear venda/comanda.

## Auditoria

Para apps como MesaUp, manter historico de:

- quem abriu;
- quem fechou;
- quem cancelou;
- quem excluiu;
- data/hora;
- dispositivo;
- motivo quando aplicavel.

Isso ajuda muito em restaurante, bar, hotel e caixa.
