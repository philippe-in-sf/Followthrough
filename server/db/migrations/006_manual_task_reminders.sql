UPDATE tasks
SET reminder_mode = 'manual'
WHERE reminder_mode <> 'manual';
