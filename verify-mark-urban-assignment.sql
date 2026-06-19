-- Run these in the Supabase SQL editor to diagnose the stuck assignment,
-- then run the UPDATE at the bottom only if assigned_employee_id is wrong/missing.

select id, status, assigned_employee_id, assigned_worker_name, assigned_worker_phone
from service_requests
where id = '30433c8e-ffa9-4bbf-b178-0934cf1d88b4';

select id, full_name, phone, active
from employees
where lower(trim(full_name)) = lower(trim('Mark Urban'));

-- If the first query's assigned_employee_id does not match the id returned by
-- the second query, fix it (replace <employee_id> with Mark Urban's id):
-- update service_requests
-- set assigned_employee_id = '<employee_id>'
-- where id = '30433c8e-ffa9-4bbf-b178-0934cf1d88b4';
