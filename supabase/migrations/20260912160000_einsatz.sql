-- Einsatzplanung und Ruestliste.
--
-- Zwei Vorgaenge, die in Firestore je ein Batch waren und hier je eine
-- Funktion werden. Beide laufen mit den Rechten des Aufrufers.

-- ---------------------------------------------------------------------------
-- Die Kennung einer Ruestposition kommt vom Geraet und ist kein UUID
-- ---------------------------------------------------------------------------

/*
  Der Planer legt eine Position an, bevor irgendein Server davon weiss; die
  Kennung entsteht deshalb im Browser (`RuestlistePlanen.tsx`) und sieht aus
  wie `pmf3k2x9abcd`. Sie ist keine Fremdschluessel-Kennung, sondern der
  Griff, an dem der Haken „eingeladen" haengt — `geladen` ist nach ihr
  abgelegt.

  Sie auf UUID zu zwingen hiesse, beim Umzug jede bestehende Position UND
  jeden Schluessel in `geladen` gemeinsam umzuschreiben. Geht dabei ein Paar
  auseinander, steht der Haken am falschen Artikel, und niemand sieht es.
  Der Gewinn waere ein huebscherer Datentyp. Also Text.
*/
alter table einsatz_material_positionen
  alter column id drop default,
  alter column id type text using id::text,
  alter column id set default gen_random_uuid()::text;

-- ---------------------------------------------------------------------------
-- Die Einteilung eines Tages auf einer Baustelle
-- ---------------------------------------------------------------------------

/*
  ALLES ODER NICHTS. Die alte Einteilung wird geloescht und die neue
  geschrieben; bricht etwas dazwischen ab, waere der Tag sonst leer. Und die
  Ruestliste desselben Einsatzes zieht ihre Mitarbeiterliste mit — sonst
  haekchen dort Leute ab, die gar nicht mehr eingeteilt sind.
*/
create or replace function public.einsatz_speichern(
  p_datum date,
  p_baustelle text,
  p_zeilen jsonb
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
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
      company_id, date, project_number, user_id, user_name, as_helper, comment, created_by
    ) values (
      betrieb, p_datum, p_baustelle,
      (zeile ->> 'user_id')::uuid, zeile ->> 'user_name',
      coalesce((zeile ->> 'as_helper')::boolean, false),
      zeile ->> 'comment', zeile ->> 'created_by'
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

revoke all on function public.einsatz_speichern(date, text, jsonb) from public;
grant execute on function public.einsatz_speichern(date, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Ruestliste speichern
-- ---------------------------------------------------------------------------

/*
  KOPF UND POSITIONEN IN EINEM ZUG.

  In Firestore war die Ruestliste EIN Dokument mit einem Array darin; hier
  sind es zwei Tabellen. Das ist besser (eine Position ist eine Zeile, keine
  Stelle in einem Array), verlangt aber, dass beide zusammen geschrieben
  werden — sonst stuende ein Kopf ohne Positionen da.
  
  DIE KENNUNG EINER POSITION KOMMT VOM AUFRUFER und wird uebernommen. Daran
  haengt die Abhakliste `geladen`: sie ist nach Positionskennung abgelegt.
  Wuerde die Datenbank eigene Kennungen vergeben, verloere jedes Speichern
  saemtliche Haekchen.

  Ohne Positionen wird der Kopf geloescht — eine leere Ruestliste ist keine.
*/
create or replace function public.ruestliste_speichern(
  p_datum date,
  p_baustelle text,
  p_positionen jsonb,
  p_uids uuid[],
  p_von text
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  kopf uuid;
  pos jsonb;
  behalten text[];
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  select e.id into kopf from public.einsatz_material e
   where e.company_id = betrieb and e.date = p_datum and e.project_number = p_baustelle;

  if jsonb_array_length(p_positionen) = 0 then
    if kopf is not null then delete from public.einsatz_material where id = kopf; end if;
    return null;
  end if;

  if kopf is null then
    insert into public.einsatz_material (company_id, date, project_number, uids, geladen, updated_by)
         values (betrieb, p_datum, p_baustelle, coalesce(p_uids, '{}'), '{}'::jsonb, p_von)
      returning id into kopf;
  else
    update public.einsatz_material
       set uids = coalesce(p_uids, uids), updated_by = p_von
     where id = kopf;
  end if;

  -- Positionen ersetzen, Kennungen uebernehmen.
  select coalesce(array_agg(p ->> 'id'), '{}')
    into behalten
    from jsonb_array_elements(p_positionen) p;

  delete from public.einsatz_material_positionen
   where einsatz_material_id = kopf and not (id = any(behalten));

  for pos in select * from jsonb_array_elements(p_positionen) loop
    insert into public.einsatz_material_positionen (
      id, company_id, einsatz_material_id, position, material_id, name, menge, einheit
    ) values (
      pos ->> 'id', betrieb, kopf,
      coalesce((pos ->> 'position')::integer, 0),
      nullif(pos ->> 'material_id', '')::uuid,
      pos ->> 'name', (pos ->> 'menge')::numeric, pos ->> 'einheit'
    )
    on conflict (id) do update
       set position = excluded.position, material_id = excluded.material_id,
           name = excluded.name, menge = excluded.menge, einheit = excluded.einheit;
  end loop;

  -- Haekchen zu Positionen, die es nicht mehr gibt, fallen weg. Sonst bliebe
  -- „eingeladen" an einem Artikel haengen, der gar nicht mehr auf der Liste
  -- steht.
  update public.einsatz_material
     set geladen = (
       select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
         from jsonb_each(geladen) as g(k, v)
        where k = any(behalten))
   where id = kopf;

  return kopf;
end;
$$;

revoke all on function public.ruestliste_speichern(date, text, jsonb, uuid[], text) from public;
grant execute on function public.ruestliste_speichern(date, text, jsonb, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------
-- Abhaken
-- ---------------------------------------------------------------------------

/*
  Ein Haken, sonst nichts. Wer ihn setzen darf, entscheidet der Trigger
  `app.ruestliste_geschuetzt` — nur wer fuer diesen Einsatz eingeteilt ist.

  TRIFFT DIE ANWEISUNG KEINE ZEILE, IST DAS EIN FEHLER und kein Erfolg. Ohne
  die Pruefung waere ein Abhaken auf einer Liste, die es nicht (mehr) gibt,
  von aussen nicht von einem geglueckten zu unterscheiden: der Monteur sieht
  seinen Haken, und beim naechsten Laden ist er weg.
*/
create or replace function public.laden_umschalten(
  p_datum date,
  p_baustelle text,
  p_position text,
  p_an boolean,
  p_von text
) returns void
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text := app.betrieb();
  getroffen integer;
begin
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;

  update public.einsatz_material
     set geladen = case
           when p_an then geladen || jsonb_build_object(
             p_position,
             jsonb_build_object('von', p_von, 'am', (extract(epoch from now()) * 1000)::bigint))
           else geladen - p_position
         end
   where company_id = betrieb and date = p_datum and project_number = p_baustelle;

  get diagnostics getroffen = row_count;
  if getroffen = 0 then
    raise exception 'Für diesen Einsatz gibt es keine Rüstliste'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.laden_umschalten(date, text, text, boolean, text) from public;
grant execute on function public.laden_umschalten(date, text, text, boolean, text) to authenticated;
