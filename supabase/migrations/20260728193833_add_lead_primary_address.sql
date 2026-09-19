alter table leads add column if not exists address text;
comment on column leads.address is 'Primary company address, distinct from lead_locations which tracks additional branches/sites';