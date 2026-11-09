# Vendix

Sistema simples de vendas e assinaturas em HTML + CSS + JavaScript puro, com Supabase como backend.
Sem build, sem dependências para instalar (o `supabase-js` é carregado por CDN).

## Módulos
- **Painel**: vendas do mês, MRR, a receber, últimos pedidos e faturas em aberto.
- **Pedidos**: criação com vários itens, baixa de estoque automática e cancelamento com devolução ao estoque.
- **Clientes** e **Produtos**: CRUD com busca e paginação no servidor.
- **Assinaturas**: planos (mensal/trimestral/anual), assinaturas por cliente, faturas recorrentes e baixa de pagamento.

## Como rodar
1. Crie um projeto no [Supabase](https://supabase.com).
2. No **SQL Editor**, cole e execute o conteúdo de `schema.sql`.
3. Em **Project Settings → API**, copie a *Project URL* e a chave *anon* para `config.js`.
4. (Opcional) Em **Authentication → Providers → Email**, desative "Confirm email" para testar mais rápido.
5. Sirva a pasta por HTTP (módulos ES não funcionam abrindo o arquivo direto):
   ```
   python3 -m http.server 8080
   ```
   e abra http://localhost:8080.

## Faturas automáticas
O botão **Gerar faturas do ciclo** (aba Faturas) cria as faturas das assinaturas que vencem em até 5 dias
e avança o próximo vencimento. Para rodar todo dia sozinho, ative a extensão `pg_cron` e use o comando
comentado no final do `schema.sql`.

## Segurança
Todas as tabelas têm RLS: cada usuário só enxerga e altera os próprios dados. A chave `anon` pode ficar no front-end.

## Otimizações
- Páginas carregadas sob demanda (`import()` dinâmico).
- Paginação e busca feitas no banco; índices nas colunas filtradas.
- Pedido, itens e estoque gravados em uma única transação (`criar_pedido`).
- Painel inteiro em uma única chamada (`dashboard_resumo`).
