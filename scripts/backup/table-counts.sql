-- WAWIS backup: dokładne liczby wierszy tabel objętych kopią (tylko odczyt).
-- Ten sam plik liczy wiersze na produkcji (przed i po zrzucie) i w bazie odtworzonej,
-- dzięki czemu porównanie jest porównaniem tego samego zapytania.
-- Wynik: jeden obiekt JSON {"schemat.tabela": liczba, ...}.
select coalesce(jsonb_object_agg(t.schema_name || '.' || t.table_name, t.row_count order by t.schema_name, t.table_name), '{}'::jsonb)::text
from (
  select n.nspname as schema_name,
         c.relname as table_name,
         (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text::bigint as row_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and (
      n.nspname in ('public', 'private')
      or (n.nspname = 'auth' and c.relname in ('users', 'identities'))
      or (n.nspname = 'storage' and c.relname in ('buckets', 'objects'))
    )
) t;
