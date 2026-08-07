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
```

A chave de serviço deve permanecer somente no backend.
