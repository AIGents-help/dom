
-- Tier = mission complexity / pilot skill requirement (matches DOM SOP tiers)
create type lead_tier as enum ('tier_1', 'tier_2', 'tier_3');

-- Vertical = target industry category
create type lead_vertical as enum (
  'roofing',
  'insurance_restoration',
  'public_adjuster',
  'property_management',
  'general_contractor',
  'other'
);

alter table leads
  add column if not exists tier lead_tier,
  add column if not exists vertical lead_vertical;

comment on column leads.tier is 'Tier 1 = entry roof inspection SOP, Tier 2 = thermal/moisture SOP, Tier 3 = ortho/mapping SOP';
comment on column leads.vertical is 'Target industry category for this prospect';
