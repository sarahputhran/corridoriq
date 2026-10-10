-- Some evidence records carry only a month ("2025-10"). Keep the date as published in date_text;
-- the date column is filled only when the source gives a full day.
alter table complaints_evidence add column date_text text;
