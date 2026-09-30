-- TESTBERICHT 30.09.2026, M34 — EINE UHRZEIT JE EINSATZ.
--
-- Ein Einsatz hatte nur einen Tag. Wer vormittags auf der einen und
-- nachmittags auf der anderen Baustelle ist, stand zweimal da, ohne dass man
-- sah, wann. Jetzt optional von–bis; ohne Angabe bleibt es der ganze Tag.
--
-- Die Einteilung der Projektleitung (der zweite Teil von M34) kam mit Paket
-- 3c: `companies.projektleitung_im_einsatzplan`.

alter table public.assignments
  add column if not exists zeit_von time,
  add column if not exists zeit_bis time;

alter table public.assignments
  drop constraint if exists assignments_zeit_folge;
alter table public.assignments
  add constraint assignments_zeit_folge
    check (zeit_von is null or zeit_bis is null or zeit_bis > zeit_von);

-- Unverändert aus 20260929120000_support_arbeitet_mit.sql, bis auf die
-- beiden Uhrzeiten.
create or replace function public.einsatz_speichern(
  p_datum date,
  p_baustelle text,
  p_zeilen jsonb
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.arbeitsbetrieb();
  zeile jsonb;
  anzahl integer := 0;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  delete from public.assignments
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  for zeile in select * from jsonb_array_elements(p_zeilen) loop
    insert into public.assignments (
      company_id, date, project_number, user_id, user_name, as_helper, comment, created_by,
      zeit_von, zeit_bis
    ) values (
      betrieb, p_datum, p_baustelle,
      (zeile ->> 'user_id')::uuid, zeile ->> 'user_name',
      coalesce((zeile ->> 'as_helper')::boolean, false),
      zeile ->> 'comment', zeile ->> 'created_by',
      nullif(zeile ->> 'zeit_von', '')::time, nullif(zeile ->> 'zeit_bis', '')::time
    );
    anzahl := anzahl + 1;
  end loop;

  update public.einsatz_material
     set uids = coalesce(
           (select array_agg((z ->> 'user_id')::uuid) from jsonb_array_elements(p_zeilen) z),
           '{}'::uuid[])
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  return anzahl;
end;
$$;
