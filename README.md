# Suport_Backend

Backend do Portal de Ocorrências de Suporte, conectado ao Supabase no schema `suporte`.

## Estrutura

- `api/`: autenticação, usuários, catálogo, ocorrências e agenda.
- `database/`: histórico de schema e migrações.
- `types/`: tipos do ambiente de execução.

## Instalação

```bash
npm install
npm run typecheck
```

## Configuração

Crie `.env.local` usando `.env.example` e preencha:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_SCHEMA=suporte
ALLOWED_ORIGINS=
PERSISTENT_LOGIN_RATE_LIMIT=false
```

A chave de serviço deve permanecer somente no backend.

`ALLOWED_ORIGINS` aceita uma lista separada por vírgulas. Use somente origens
adicionais realmente necessárias; requisições que chegam pelo proxy normal são
validadas por `Origin` e `X-Forwarded-Host`.

## Supabase

Os arquivos SQL versionados ficam em `supabase/`.

- Em uma instalação nova, use `portal_occurrences.sql` para criar a tabela de ocorrências.
- Em uma instalação existente, execute primeiro `audit_occurrence_dates.sql`, que é somente leitura.
- Execute `login_rate_limit.sql` e só então defina `PERSISTENT_LOGIN_RATE_LIMIT=true` no ambiente publicado.

Enquanto a variável estiver desativada, o login mantém o limitador compatível em
memória para não interromper o acesso durante a implantação. A proteção persistente
entre instâncias serverless só fica ativa depois da migração e da variável habilitada.

Não altere automaticamente datas históricas. Se a auditoria indicar um tipo diferente de
`timestamptz`, faça backup e prepare uma migração específica depois de confirmar quais
registros foram afetados.
