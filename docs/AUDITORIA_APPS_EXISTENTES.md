# Auditoria dos apps existentes

Esta auditoria foi gerada com `audit-apps.ps1` para mapear quais apps ja seguem o padrao GHZ e quais precisam de modernizacao.

Ela nao substitui teste manual, mas ajuda a decidir prioridades.

## Comandos

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit-apps.ps1
```

Para tambem verificar diffs de URLs em repos Git locais:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\audit-apps.ps1 -CheckGitDiff
```

## Apps mais proximos do padrao

| App | Pontos fortes |
| --- | --- |
| `ZAPBOT` | `frame: false`, renderer seguro, sandbox, licenca antes do app, gate no main, winbar, suporte e superficie de update/download. |
| `[SUPABASE] FOLHAPRO` | `frame: false`, renderer seguro, sandbox, licenca antes do app, gate no main, winbar, suporte e update/download. |
| `_GHZ_APP_STANDARD` | Template de referencia com janela frameless, renderer seguro, sandbox, licenca, gate no main, winbar e suporte. |

## Apps parcialmente aderentes

| App | Observacao |
| --- | --- |
| `ZAPDISPARO` | Tem renderer seguro, sandbox, licenca, gate, winbar e suporte, mas a auditoria nao detectou `frame: false`. Confirmar se a janela ainda usa barra nativa. |
| `[SUPABASE] MESAUP` | Tem janela frameless, seguranca, sandbox, licenca, gate e winbar. A auditoria nao detectou `ghz-support`, mas encontrou URL oficial. Confirmar se o suporte esta implementado por outro componente/nome. |
| `[SUPABASE] IMOBCORE` | Tem frameless, licenca, gate, winbar e suporte, mas falta confirmar renderer seguro e sandbox. |
| `[SUPABASE] NEXHOTEL` | Tem frameless, licenca, gate, winbar e suporte, mas falta confirmar renderer seguro/sandbox e URLs oficiais de suporte. |
| `GO POST` | Tem frameless, renderer seguro e sandbox, mas nao tem winbar detectada. |
| `RECOVERX` | Tem frameless, licenca e gate, mas falta renderer seguro, sandbox e winbar. |

## Apps antigos que precisam de alinhamento

Estes apps aparecem com varios pontos antigos: sem `frame: false`, sem sandbox, sem winbar nova ou sem licenca antes do app.

| App | Pontos a revisar primeiro |
| --- | --- |
| `ASOFACIL` | Licenca, winbar, update/download e janela frameless. |
| `CLEANBOOST` | Janela frameless, renderer seguro, sandbox e winbar. |
| `CLINICA_MAZIERO` | Licenca, gate no main, janela frameless, renderer seguro, sandbox e winbar. |
| `CPFCHECK` | Janela frameless, renderer seguro, sandbox e winbar. |
| `IRPRO` | Janela frameless, renderer seguro, sandbox e winbar. |
| `MAILPRO` | Licenca, gate no main, janela frameless, renderer seguro, sandbox e winbar. |
| `PONTOPRO` | Janela frameless, renderer seguro, sandbox e winbar. |
| `PONTOPRO-entrega-local` | Mesmo ponto do `PONTOPRO`; confirmar se e copia de entrega ou fonte ativa. |
| `STOQUE-STORE` | Licenca, gate no main, janela frameless, sandbox, winbar e URLs oficiais de suporte. |
| `ZAPBOT COM IA` | Product name/appId, janela frameless, renderer seguro, sandbox e winbar. |
| `[SUPABASE] PETFLOW` | Janela frameless, renderer seguro, sandbox e winbar. |
| `[SUPABASE] STUDIOFLOW` | Janela frameless, renderer seguro, sandbox e winbar. |

## Prioridade sugerida

1. Proteger links fixos de download/update em todos os apps ativos.
2. Padronizar apps novos usando `_GHZ_APP_STANDARD`, sem tentar refatorar tudo de uma vez.
3. Modernizar primeiro apps ativos de maior venda/uso.
4. Usar `ZAPBOT`, `[SUPABASE] FOLHAPRO` e este template como referencia tecnica.
5. Tratar apps antigos como migracoes controladas: uma regra por vez, com teste de instalador e download ao final.

## Observacoes importantes

- A auditoria e baseada em sinais de codigo; ela pode ter falso negativo quando um app usa outro nome de componente.
- `Zap Spark` precisa ser confirmado contra o nome real do repositorio/app. No workspace foram encontrados `ZAPDISPARO`, `ZAPBOT` e `ZAPBOT COM IA`.
- Depois que um app for modernizado, rode `audit-apps.ps1` novamente e atualize este documento.
