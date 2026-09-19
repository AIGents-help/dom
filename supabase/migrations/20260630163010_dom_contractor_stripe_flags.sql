
alter table contractors add column if not exists stripe_payouts_enabled boolean not null default false;
alter table contractors add column if not exists stripe_charges_enabled boolean not null default false;
