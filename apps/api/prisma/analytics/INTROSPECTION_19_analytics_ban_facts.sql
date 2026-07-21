-- =============================================================================
-- INTROSPECTION_19_analytics_ban_facts.sql
-- LAST architecture probe before RESPECT implementation
-- mode: READ-ONLY — SELECT only
-- =============================================================================
-- REJECTED (do not reconsider):
--   analytics.v_pair_survived_count
--   analytics.v_pair_both_no_count
--   analytics.v_pair_overboard_count
--   (undirected pair_id / user_a_id / user_b_id / numeric counts)
--
-- This file investigates ONLY:
--   public.analytics_ban_facts
--
-- After paste → answer ONE question:
--   Can v_pair_respect_v1 be built on analytics_ban_facts?  YES | NO
-- If NO → accept public."Ban" immediately. No further object search.
-- =============================================================================

-- 0) Existence + object kind
select
  'public.analytics_ban_facts'::text as object_ref,
  case
    when to_regclass('public.analytics_ban_facts') is null then 'MISSING'
    else 'EXISTS'
  end as status,
  (
    select case c.relkind
      when 'r' then 'table'
      when 'v' then 'view'
      when 'm' then 'matview'
      else c.relkind::text
    end
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'analytics_ban_facts'
    limit 1
  ) as object_type;

-- 1) Columns
select
  column_name,
  data_type,
  udt_name,
  ordinal_position
from information_schema.columns
where table_schema = 'public'
  and table_name = 'analytics_ban_facts'
order by ordinal_position;

-- 2) pg_get_viewdef OR note if table/matview/missing
select
  'public.analytics_ban_facts'::text as object_name,
  case
    when to_regclass('public.analytics_ban_facts') is null then '[MISSING]'
    when (
      select c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'analytics_ban_facts'
      limit 1
    ) = 'v'
      then pg_get_viewdef('public.analytics_ban_facts'::regclass, true)
    when (
      select c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'analytics_ban_facts'
      limit 1
    ) = 'm'
      then '[matview — no pg_get_viewdef]'
    else '[table — no pg_get_viewdef]'
  end as view_or_note;

-- 3) Dependencies (1-hop; empty if table / missing)
select
  dep_ns.nspname as depends_on_schema,
  dep_cls.relname as depends_on_object,
  case dep_cls.relkind
    when 'v' then 'view'
    when 'm' then 'matview'
    when 'r' then 'table'
    else dep_cls.relkind::text
  end as depends_on_type
from pg_class src
join pg_namespace src_ns on src_ns.oid = src.relnamespace
join pg_rewrite rw on rw.ev_class = src.oid
join pg_depend d on d.objid = rw.oid and d.deptype = 'n'
join pg_class dep_cls on dep_cls.oid = d.refobjid
join pg_namespace dep_ns on dep_ns.oid = dep_cls.relnamespace
where src_ns.nspname = 'public'
  and src.relname = 'analytics_ban_facts'
  and src.relkind in ('v', 'm')
  and dep_cls.oid <> src.oid
order by depends_on_schema, depends_on_object;

-- 4) Sample rows
select *
from public.analytics_ban_facts
limit 20;

-- 5) Required-field checklist (information_schema only)
select
  expected.column_name as expected_column,
  (c.column_name is not null) as exists_in_production
from (
  values
    ('sender_id'),
    ('senderId'),
    ('sender'),
    ('receiver_id'),
    ('receiverId'),
    ('receiver'),
    ('outcome'),
    ('status'),
    ('created_at'),
    ('createdAt'),
    ('completed_at'),
    ('completedAt'),
    ('handled_at'),
    ('handledAt')
) as expected(column_name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'analytics_ban_facts'
 and c.column_name = expected.column_name
order by expected.column_name;
