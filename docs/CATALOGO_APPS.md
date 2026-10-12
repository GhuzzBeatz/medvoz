# Catalogo de aplicativos GHZ

Este catalogo foi montado a partir dos `package.json` encontrados no workspace e da lista `APPS` do HTML venda. Ele serve como mapa inicial para padronizar apps existentes e criar novos projetos.

## Apps no HTML venda

| App ID | Nome | Segmento | Prefixo | Licenca |
| --- | --- | --- | --- | --- |
| `mesaup` | MesaUp | Bar / Lanchonete | `MESAUP` | Supabase |
| `nexhotel` | NexHotel | Hotelaria | `NEXHTL` | Supabase |
| `petflow` | PetFlow | Pet Shop / Vet | `PETFLW` | Supabase |
| `studioflow` | StudioFlow | Salao / Barbearia | `STFLOW` | Supabase |
| `imobcore` | ImobCore | Sistema Imobiliario | `IMOBC` | Supabase |
| `medcore` | MedCore | Clinica Medica | `MEDCOR` | Supabase |
| `folhapro` | FolhaPro | RH e Folha | `FOLHA` | Supabase |
| `spectrapiano` | Spectra Piano | Plugin VST3 Piano | `SPCTR` | Supabase |
| `zapdisparo` | ZapDisparo | Disparador WhatsApp | `ZAPDS` | Supabase |
| `zapbot` | ZapBot | Bot de Atendimento | `ZAPBT` | Supabase |
| `zapbotia` | ZapBot IA | Bot IA WhatsApp | `ZPBIA` | Supabase |
| `cleanboost` | CleanBoost | Limpeza de PC | `CLEAN` | Local |
| `pontopro` | PontoPro | Controle de Ponto | `PONTO` | Local |
| `irpro` | IRPro | Organizador de IR | `IRPRO` | Local |
| `recoverx` | RecoverX | Recuperacao de Dados | `RECVX` | Local |
| `cpfcheck` | CPFCheck | Verificador de CPF | `CPFCK` | Local |

## Apps com pagina fixa de download

Estes apps aparecem em `BAIXAR_PAGES` e devem entregar o link:

```text
https://ghzplugin.com.br/baixar/{appId}.html
```

| App ID |
| --- |
| `mesaup` |
| `nexhotel` |
| `petflow` |
| `studioflow` |
| `imobcore` |
| `medcore` |
| `folhapro` |
| `spectrapiano` |
| `zapdisparo` |
| `zapbot` |
| `zapbotia` |
| `donestok` |

## Apps Electron encontrados no workspace

| Pasta | Package name | Versao observada | Product name |
| --- | --- | --- | --- |
| `ASOFACIL` | `aso-offline-clinica` | `1.0.2` | ASO Offline |
| `CLEANBOOST` | `cleanboost` | `1.0.2` | CleanBoost |
| `CLINICA_MAZIERO` | `aso-maziero-app` | `1.0.2` | ASO Maziero Clinica |
| `CPFCHECK` | `verificador-matematico-cpf` | `1.0.3` | Verificador Matematico de CPF |
| `GO POST` | `go-post-ghz` | `0.1.0` | GO POST |
| `IRPRO` | `irpro` | `1.0.2` | IRPro |
| `MAILPRO` | `sendx` | `1.0.2` | SendX |
| `PONTOPRO` | `pontopro` | `1.0.4` | PontoPro |
| `RECOVERX` | `recoverx` | `1.0.2` | RecoverX |
| `STOQUE-STORE` | `donestok` | `1.0.2` | DonEstok |
| `ZAPBOT` | `zapbot` | `1.0.34` | ZapBot |
| `ZAPBOT COM IA` | `zapbot-ia` | `1.0.17` | A confirmar |
| `ZAPDISPARO` | `zapdisparo` | `1.0.40` | ZapDisparo |
| `[SUPABASE] FOLHAPRO` | `folhapro` | `1.0.31` | FolhaPro |
| `[SUPABASE] IMOBCORE` | `imobcore` | `1.0.21` | ImobCore |
| `[SUPABASE] MESAUP` | `mesaup` | `2.0.44` | MesaUp |
| `[SUPABASE] NEXHOTEL` | `nexhotel` | `1.0.24` | NexHotel |
| `[SUPABASE] PETFLOW` | `petflow` | `1.0.22` | PetFlow |
| `[SUPABASE] STUDIOFLOW` | `studioflow` | `1.0.11` | StudioFlow |

## Pontos para confirmar

- O nome "Zap Spark" citado na conversa deve ser confirmado contra o app real (`zapdisparo`, `zapbot`, `zapbotia` ou outro repositorio ainda nao mapeado).
- `ZAPBOT COM IA` precisa confirmar `build.productName` e `build.appId`.
- Apps antigos podem ainda nao estar 100% aderentes ao padrao de janela, suporte, licenca e atualizacao.
- O catalogo deve ser atualizado sempre que um novo app for criado ou renomeado.

## Regra de manutencao do catalogo

Ao criar app novo, adicionar imediatamente:

- pasta/repo;
- `appId` publico;
- nome comercial;
- prefixo de chave;
- tipo de licenca;
- tipo de download;
- link fixo;
- versao inicial;
- observacoes de update.
