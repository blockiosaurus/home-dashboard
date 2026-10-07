-- All-day events used to be stored at UTC midnight, which the widgets
-- (reading local time) placed on the previous day west of Greenwich. Move
-- every all-day row to local midnight of the same calendar date. SQLite's
-- 'utc' modifier reads the date as local time in the process's zone.
UPDATE `events_cache` SET
  `start` = CAST(strftime('%s', date(`start` / 1000, 'unixepoch'), 'utc') AS INTEGER) * 1000,
  `end` = CAST(strftime('%s', date(`end` / 1000, 'unixepoch'), 'utc') AS INTEGER) * 1000
WHERE `all_day` = 1;
