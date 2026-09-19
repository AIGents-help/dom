alter table payments add column transfer_error text;
alter table payments add column transfer_attempted_at timestamptz;
create unique index payments_assignment_active_idx on payments(assignment_id) where status != 'failed';