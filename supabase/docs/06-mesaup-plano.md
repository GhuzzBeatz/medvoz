# 06 - Plano para MesaUp com Supabase do Cliente

Este documento resume boas ideias para aplicar o padrao deste repositorio no MesaUp.

## Objetivo no MesaUp

Permitir que o dono do restaurante/bar/hotel conecte a propria conta Supabase para:

- sincronizar dados entre computadores;
- acessar dashboard pelo celular;
- manter backup em nuvem;
- receber pedidos online com mais controle;
- consultar vendas fora do computador principal;
- reduzir risco de perda de dados.

## O que deve ir para o Supabase do cliente

Sugestao de tabelas:

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
- `mu_caixas`
- `mu_auditoria`

## Status importantes

Comandas:

- `aberta`
- `fechada`
- `cancelada`
- `excluida`

Pedidos delivery:

- `pendente`
- `aceito`
- `em_preparo`
- `saiu_entrega`
- `entregue`
- `recusado`
- `cancelado`
- `excluido`

Pedidos mesa/garcom:

- `pendente`
- `atendido`
- `recusado`
- `cancelado`

## Dashboard mobile do dono

Com Supabase do cliente, pode ser criado um painel web/mobile com:

- faturamento do dia;
- valor em aberto;
- mesas ocupadas;
- pedidos delivery pendentes;
- vendas por garcom;
- produtos mais vendidos;
- caixa aberto/fechado;
- alertas de estoque;
- despesas do mes.

## Dois computadores

Com sync em nuvem:

- PC do caixa e PC do gerente podem ver os mesmos dados;
- alteracoes precisam ter `source_client`;
- eventos financeiros precisam ser idempotentes para nao duplicar;
- fechamento de comanda precisa ter trava logica para evitar dois caixas fechando ao mesmo tempo.

## Cuidados financeiros

No MesaUp, financeiro precisa ser tratado como evento, nao apenas valor final.

Recomendado registrar:

- abertura de caixa;
- suprimento;
- sangria;
- venda;
- pagamento parcial;
- fechamento;
- cancelamento;
- estorno;
- exclusao logica com motivo.

## Delivery e pedidos mesa

Com Supabase do cliente, e possivel:

- pedido do cliente cair no app e no WhatsApp;
- pedido do garcom cair no caixa;
- pedidos recusados ficarem registrados;
- status ser atualizado para o dono acompanhar.

## Ordem recomendada de implementacao

1. Preparar sync basico de configuracoes e produtos.
2. Sincronizar mesas e comandas.
3. Sincronizar pedidos delivery/mesa.
4. Sincronizar financeiro com eventos.
5. Criar painel web do dono.
6. Melhorar multi-PC com travas e auditoria.

## O que nao fazer no primeiro MVP

- Nao substituir totalmente o local por nuvem logo de cara.
- Nao depender da internet para vender/fechar comanda.
- Nao misturar todos os clientes em um banco unico sem tenant forte.
- Nao colocar service_role no app.
- Nao apagar comandas/pedidos definitivamente.
