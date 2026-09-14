-- Kunde umbenennen — in EINER Transaktion mit den Baustellen.
--
-- Die Baustellen tragen den Kundennamen als Kopie, damit ihre Listen nicht
-- zusaetzlich die Kundensammlung laden muessen. Ohne Nachziehen liefen
-- Anzeige und Stammdaten nach der ersten Umbenennung auseinander — und
-- niemand wuesste, welche der beiden Schreibweisen die richtige ist.
--
-- In Firestore stand dafuer ein Batch. Ueber die REST-Schnittstelle ist eine
-- Funktion der einzige Weg, zwei Tabellen in einer Transaktion zu treffen:
-- bricht die Verbindung mittendrin ab, ist entweder beides geschehen oder
-- nichts.
--
-- KEIN security definer. Die Funktion laeuft mit den Rechten des Aufrufers,
-- und damit greifen Zeilenschutz und Rollenpruefung genauso wie bei einem
-- direkten Schreibvorgang. Eine Funktion, die sich darueber hinwegsetzt,
-- waere eine Tuer neben der Tuer.
create or replace function public.kunde_umbenennen(
  p_kunde uuid,
  p_name text,
  p_rest jsonb default '{}'::jsonb
) returns integer
  language plpgsql
  set search_path = ''
as $$
declare
  betrieb text;
  betroffen integer;
begin
  select c.company_id into betrieb from public.customers c where c.id = p_kunde;
  if betrieb is null then
    raise exception 'Kunde nicht gefunden' using errcode = '42501';
  end if;

  update public.customers
     set name = p_name,
         address       = coalesce(p_rest ->> 'address',       address),
         contact_name  = coalesce(p_rest ->> 'contact_name',  contact_name),
         contact_phone = coalesce(p_rest ->> 'contact_phone', contact_phone),
         email         = coalesce(p_rest ->> 'email',         email),
         vat_id        = coalesce(p_rest ->> 'vat_id',        vat_id),
         notes         = coalesce(p_rest ->> 'notes',         notes),
         active        = coalesce((p_rest ->> 'active')::boolean, active)
   where id = p_kunde;

  if not found then
    -- Der Zeilenschutz hat die Zeile nicht durchgelassen.
    raise exception 'Kunde darf nicht geändert werden' using errcode = '42501';
  end if;

  update public.projects
     set customer_name = p_name
   where customer_id = p_kunde;
  get diagnostics betroffen = row_count;

  return betroffen;
end;
$$;

revoke all on function public.kunde_umbenennen(uuid, text, jsonb) from public;
grant execute on function public.kunde_umbenennen(uuid, text, jsonb) to authenticated;
