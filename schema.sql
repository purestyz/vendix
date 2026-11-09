-- =====================================================================
-- Vendix · schema para Supabase (rode no SQL Editor, de uma vez só)
-- Multi-usuário: cada conta enxerga apenas os próprios dados (RLS).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tabelas ----------
create table public.clientes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome       text not null,
  documento  text,
  email      text,
  telefone   text,
  endereco   text,
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table public.produtos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome       text not null,
  sku        text,
  preco      numeric(12,2) not null default 0 check (preco >= 0),
  estoque    integer,                       -- null = não controla estoque
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

create table public.pedidos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero      bigint generated always as identity,
  cliente_id  uuid not null references public.clientes(id) on delete restrict,
  status      text not null default 'aberto' check (status in ('aberto','faturado','entregue','cancelado')),
  total       numeric(12,2) not null default 0,
  observacao  text,
  criado_em   timestamptz not null default now()
);

create table public.pedido_itens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pedido_id   uuid not null references public.pedidos(id) on delete cascade,
  produto_id  uuid references public.produtos(id) on delete set null,
  descricao   text not null,
  quantidade  integer not null check (quantidade > 0),
  preco_unit  numeric(12,2) not null check (preco_unit >= 0),
  subtotal    numeric(12,2) generated always as (quantidade * preco_unit) stored
);

create table public.planos (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome           text not null,
  descricao      text,
  preco          numeric(12,2) not null check (preco >= 0),
  periodicidade  text not null default 'mensal' check (periodicidade in ('mensal','trimestral','anual')),
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now()
);

create table public.assinaturas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cliente_id         uuid not null references public.clientes(id) on delete restrict,
  plano_id           uuid not null references public.planos(id) on delete restrict,
  status             text not null default 'ativa' check (status in ('ativa','pausada','cancelada')),
  valor              numeric(12,2) not null check (valor >= 0),
  inicio             date not null default current_date,
  proximo_vencimento date not null,
  criado_em          timestamptz not null default now()
);

create table public.faturas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  assinatura_id uuid not null references public.assinaturas(id) on delete cascade,
  valor         numeric(12,2) not null,
  vencimento    date not null,
  status        text not null default 'pendente' check (status in ('pendente','paga','atrasada','cancelada')),
  pago_em       timestamptz,
  criado_em     timestamptz not null default now()
);

-- ---------- Índices ----------
create index on public.clientes     (user_id, nome);
create index on public.produtos     (user_id, nome);
create index on public.pedidos      (user_id, criado_em desc);
create index on public.pedidos      (cliente_id);
create index on public.pedido_itens (pedido_id);
create index on public.assinaturas  (user_id, status, proximo_vencimento);
create index on public.assinaturas  (cliente_id);
create index on public.faturas      (user_id, status, vencimento);
create unique index faturas_unica_por_ciclo on public.faturas (assinatura_id, vencimento);

-- ---------- Segurança (RLS) ----------
do $$
declare t text;
begin
  foreach t in array array['clientes','produtos','pedidos','pedido_itens','planos','assinaturas','faturas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy "dono" on public.%I for all to authenticated
                      using (user_id = (select auth.uid()))
                      with check (user_id = (select auth.uid()))$p$, t);
  end loop;
end $$;

-- ---------- Regras de negócio ----------

-- Assinatura: valor padrão = preço do plano; 1º vencimento = data de início
create or replace function public.assinatura_defaults() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.valor is null then
    select preco into new.valor from planos where id = new.plano_id;
  end if;
  if new.proximo_vencimento is null then
    new.proximo_vencimento := coalesce(new.inicio, current_date);
  end if;
  return new;
end $$;

create trigger trg_assinatura_defaults
before insert on public.assinaturas
for each row execute function public.assinatura_defaults();

-- Cria pedido + itens + baixa de estoque numa única transação
create or replace function public.criar_pedido(p_cliente uuid, p_obs text, p_itens jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid; it jsonb; v_prod produtos%rowtype;
  v_qtd int; v_preco numeric; v_total numeric := 0;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then
    raise exception 'O pedido precisa ter ao menos um item';
  end if;

  insert into pedidos(cliente_id, observacao) values (p_cliente, p_obs) returning id into v_id;

  for it in select * from jsonb_array_elements(p_itens) loop
    v_qtd   := (it->>'quantidade')::int;
    v_preco := (it->>'preco_unit')::numeric;
    if v_qtd <= 0 then raise exception 'Quantidade inválida'; end if;

    select * into v_prod from produtos where id = (it->>'produto_id')::uuid for update;
    if not found then raise exception 'Produto não encontrado'; end if;

    if v_prod.estoque is not null then
      if v_prod.estoque < v_qtd then
        raise exception 'Estoque insuficiente para "%" (disponível: %)', v_prod.nome, v_prod.estoque;
      end if;
      update produtos set estoque = estoque - v_qtd where id = v_prod.id;
    end if;

    insert into pedido_itens(pedido_id, produto_id, descricao, quantidade, preco_unit)
    values (v_id, v_prod.id, v_prod.nome, v_qtd, v_preco);

    v_total := v_total + v_qtd * v_preco;
  end loop;

  update pedidos set total = round(v_total, 2) where id = v_id;
  return v_id;
end $$;

-- Cancela pedido devolvendo o estoque
create or replace function public.cancelar_pedido(p_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare v_status text; r record;
begin
  select status into v_status from pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado'; end if;
  if v_status = 'cancelado' then return; end if;

  for r in select produto_id, sum(quantidade) as q from pedido_itens
           where pedido_id = p_id and produto_id is not null group by produto_id loop
    update produtos set estoque = estoque + r.q where id = r.produto_id and estoque is not null;
  end loop;

  update pedidos set status = 'cancelado' where id = p_id;
end $$;

-- Números do painel em uma única chamada
create or replace function public.dashboard_resumo()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'vendas_mes',  coalesce((select sum(total) from pedidos
                             where status <> 'cancelado' and criado_em >= date_trunc('month', now())), 0),
    'pedidos_mes', (select count(*) from pedidos
                    where status <> 'cancelado' and criado_em >= date_trunc('month', now())),
    'clientes',    (select count(*) from clientes where ativo),
    'assinaturas_ativas', (select count(*) from assinaturas where status = 'ativa'),
    'mrr', coalesce((select sum(case pl.periodicidade
                                  when 'mensal' then a.valor
                                  when 'trimestral' then a.valor / 3
                                  else a.valor / 12 end)
                     from assinaturas a join planos pl on pl.id = a.plano_id
                     where a.status = 'ativa'), 0),
    'a_receber', coalesce((select sum(valor) from faturas where status in ('pendente','atrasada')), 0),
    'faturas_atrasadas', (select count(*) from faturas
                          where status = 'atrasada' or (status = 'pendente' and vencimento < current_date))
  );
$$;

-- Gera as faturas das assinaturas que vencem nos próximos 5 dias
-- e marca como atrasadas as pendentes vencidas. Retorna quantas criou.
create or replace function public.gerar_faturas()
returns int language plpgsql security invoker set search_path = public as $$
declare a record; n int := 0; meses int;
begin
  update faturas set status = 'atrasada' where status = 'pendente' and vencimento < current_date;

  for a in
    select s.id, s.user_id, s.valor, s.proximo_vencimento, pl.periodicidade
    from assinaturas s join planos pl on pl.id = s.plano_id
    where s.status = 'ativa' and s.proximo_vencimento <= current_date + 5
    for update of s
  loop
    meses := case a.periodicidade when 'mensal' then 1 when 'trimestral' then 3 else 12 end;

    insert into faturas(user_id, assinatura_id, valor, vencimento)
    values (a.user_id, a.id, a.valor, a.proximo_vencimento)
    on conflict (assinatura_id, vencimento) do nothing;

    update assinaturas
       set proximo_vencimento = (a.proximo_vencimento + make_interval(months => meses))::date
     where id = a.id;
    n := n + 1;
  end loop;

  return n;
end $$;

-- OPCIONAL: gerar faturas todo dia às 06:00 (ative a extensão pg_cron em Database > Extensions)
-- select cron.schedule('faturas-diarias', '0 6 * * *', $$select public.gerar_faturas()$$);
