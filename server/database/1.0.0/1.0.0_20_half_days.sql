ALTER TABLE task_loads
  ADD CONSTRAINT task_loads_days_half_day_chk
  CHECK (days >= 0 AND days * 2 = trunc(days * 2));

ALTER TABLE task_allocations
  ADD CONSTRAINT task_allocations_days_half_day_chk
  CHECK (days >= 0 AND days * 2 = trunc(days * 2));