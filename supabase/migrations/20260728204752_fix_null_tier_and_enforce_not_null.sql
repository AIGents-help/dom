
-- Fix the existing bad row
update leads set tier = '{}' where tier is null;

-- Prevent this from ever happening again — tier can now never be null,
-- only an empty array at worst, regardless of what any future code writes.
alter table leads alter column tier set not null;
