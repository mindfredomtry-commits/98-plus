-- =============================================================================
-- INTROSPECTION_respect_v1.sql  (outcome / Ban spot-checks)
-- Companion to INTROSPECTION_relationship_direction_v1.sql
-- READ-ONLY
-- =============================================================================

-- Outcome distribution
select outcome::text, status::text, count(*)::bigint as n
from public."Ban"
group by 1, 2
order by n desc;

select outcome::text, count(*)::bigint as n
from public."Ban"
where outcome is not null
group by 1
order by n desc;

-- Spot samples
select id, "senderId", "receiverId", status::text, outcome::text,
       "isOverboard", "acceptedAt", "completedAt"
from public."Ban"
where outcome = 'BOTH_NO'
order by "completedAt" desc nulls last
limit 20;

select id, "senderId", "receiverId", status::text, outcome::text,
       "completedAt"
from public."Ban"
where outcome = 'SPLIT'
order by "completedAt" desc nulls last
limit 20;

select id, "senderId", "receiverId", status::text, outcome::text,
       "completedAt"
from public."Ban"
where outcome = 'TIMEOUT' or status = 'FAILED'
order by "completedAt" desc nulls last
limit 20;

-- For a BOTH_NO ban id:
-- select "userId", completed, "createdAt"
-- from public."BanCheckAnswer"
-- where "banId" = ':ban_id';

-- Prefer INTROSPECTION_relationship_direction_v1.sql for direction helper hunt.
