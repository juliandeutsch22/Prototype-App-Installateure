-- Eine Ruestposition gehoert zu IHRER Liste — auch ihre Kennung.
--
-- GEFUNDEN BEIM PRUEFEN DER ABONNEMENTS UNTER LAST, und es war kein
-- Testartefakt.
--
-- `einsatz_material_positionen.id` war der alleinige Primaerschluessel, also
-- betriebsweit eindeutig. Die Kennung kommt aber vom Geraet und meint „diese
-- Position IN DIESER Liste" — genau so ist auch `geladen` abgelegt.
--
-- Was dabei herauskam: taucht dieselbe Kennung in einer zweiten Ruestliste
-- auf, greift `on conflict (id) do update`, und die Anweisung aktualisiert
-- Name und Menge der ALTEN Zeile, ohne sie umzuhaengen — sie bleibt an der
-- ersten Liste. Die zweite Liste steht danach LEER da. Kein Fehler, keine
-- Meldung: der Kopf ist da, die Positionen fehlen, und der Monteur faehrt
-- ohne Material los.
--
-- Ein Zusammentreffen ist unwahrscheinlich (die Kennung traegt einen
-- Zeitstempel und fuenf Zufallszeichen), aber „unwahrscheinlich und lautlos"
-- ist die schlechteste Kombination. Der Schluessel ist jetzt das Paar aus
-- Liste und Kennung — das ist das, was die App ohnehin meint.

alter table einsatz_material_positionen drop constraint einsatz_material_positionen_pkey;
alter table einsatz_material_positionen
  add constraint einsatz_material_positionen_pkey
  primary key (einsatz_material_id, id);

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
    -- Das PAAR aus Liste und Kennung, nicht die Kennung allein. Sonst
    -- aktualisiert dieselbe Kennung aus einer anderen Liste deren Zeile und
    -- diese Liste bleibt leer.
    on conflict (einsatz_material_id, id) do update
       set position = excluded.position, material_id = excluded.material_id,
           name = excluded.name, menge = excluded.menge, einheit = excluded.einheit;
  end loop;

  update public.einsatz_material
     set geladen = (
       select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
         from jsonb_each(geladen) as g(k, v)
        where k = any(behalten))
   where id = kopf;

  return kopf;
end;
$$;
