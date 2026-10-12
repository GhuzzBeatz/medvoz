# MedVoz

Assistente GHZ para transcricao medica, documentacao clinica, pacientes e documentos revisaveis.

## Modulos

- Licenca online fail-closed via `ghz-license.php`.
- Gravacao de consulta presencial, teleconsulta ou reuniao clinica.
- Triagem de assunto medico antes da transcricao completa.
- Transcricao OpenAI com suporte a diarizacao.
- Cadastro local de pacientes e historico de atendimentos.
- Geracao de SOAP, evolucao, receita/conduta, atestado, encaminhamento, exames, LME e SP/SADT.
- Agente clinico contextual para lacunas, qualidade e orientacoes.
- Atualizacao pelo GitHub Releases.

## Configuracao local

Crie um arquivo `.env.local` na raiz do projeto com:

```text
OPENAI_API_KEY=sua_chave_aqui
```

Esse arquivo e ignorado pelo Git e nunca deve ser enviado ao repositorio.

## Comandos

```powershell
npm install
npm run check
npm start
npm run dist
```

## Atualizacoes

O app consulta:

```text
https://api.github.com/repos/GhuzzBeatz/medvoz/releases/latest
```

Publique novos instaladores em GitHub Releases mantendo o repositorio `GhuzzBeatz/medvoz`.
