# Suport_Backend

Backend do Portal de Ocorrências de Suporte.

## Estrutura

- `api/`: rotas de autenticação, usuários, catálogo e ocorrências.
- `auth/`: auxiliares de autenticação.
- `database/`: schema e migrações do banco de dados.
- `worker/`: entrada para execução no Cloudflare Worker.
- `types/`: tipos das integrações Cloudflare.

## Instalação

```bash
npm install
npm run typecheck
```

## Banco de dados

```bash
npm run db:generate
```

