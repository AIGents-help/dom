
create type lead_status_new as enum ('cold', 'contacted', 'qualified', 'quoted', 'scheduled', 'customer', 'lost');

alter table leads alter column status drop default;

alter table leads
  alter column status type lead_status_new
  using (
    case status::text
      when 'new' then 'cold'
      when 'converted' then 'customer'
      else status::text
    end
  )::lead_status_new;

alter table leads alter column status set default 'cold';

drop type lead_status;
alter type lead_status_new rename to lead_status;
