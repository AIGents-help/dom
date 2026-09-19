
alter table leads
  alter column tier type lead_tier[]
  using (case when tier is null then '{}'::lead_tier[] else array[tier]::lead_tier[] end);

alter table leads alter column tier set default '{}';

comment on column leads.tier is 'A client can require multiple tiers at once (e.g. roof inspection + thermal), so this is an array, not a single value.';
