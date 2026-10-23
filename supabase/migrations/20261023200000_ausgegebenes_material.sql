/*
  AUSGEGEBENES MATERIAL OHNE SCHEIN (Auftrag 23.10.2026)

  WAS FEHLTE. Material kam nur über unterschriebene Scheine auf die Rechnung.
  Bei einer Baustelle über Wochen gibt es nicht für jeden Tag einen Schein —
  was das Lager ausgegeben hat (abgeholte Anforderungen, eingeladene
  Rüstlisten), fiel beim Verrechnen niemandem auf.

  WAS DIESE FUNKTION GIBT. Die Ausgaben einer Baustelle als Liste:
  abgeholte Anforderungen und eingeladene Rüstlistenpositionen mit ihrer
  Menge, Retouren von dieser Baustelle mit negativer Menge. Gegen die Scheine
  rechnet die App, denn die Scheine kennt sie aus der Vorschau.

  WAS ALS ABGERECHNET GILT. Alles bis zum Leistungsende der letzten gültigen
  Rechnung dieser Baustelle (ohne Anzahlungen und Stornierte). Eine Rechnung
  ist der Zeitpunkt, an dem das Büro über das Ausgegebene entschieden hat —
  übernommen oder bewusst nicht. Damit kommt nichts zweimal, auch nicht aus
  der Zeit vor dieser Funktion; ein Storno öffnet den Zeitraum wieder. Ohne
  eigene Markierung an Anforderung oder Rüstliste: dieselbe Grenze, die der
  Stichtag der Rechnung schon zieht.

  WER. Wer Rechnungen schreibt (`ist_buch_oder_spitze`). Allen anderen ein
  Fehler statt einer leeren Liste.

  DATUM. Eine Anforderung zählt am Tag ihrer letzten Änderung (sie trägt kein
  eigenes Abholdatum; nach „Erledigt“ ändert sich nichts mehr), eine Retoure
  am Tag ihrer Erfassung, eine Rüstlistenposition am Tag des Einsatzes.
*/
create or replace function public.ausgegebenes_material(p_baustelle text, p_bis date default null)
  returns table (art text, beleg_id text, datum date, material_id uuid, name text, einheit text, menge numeric)
  language plpgsql stable
  security definer
  set search_path = ''
as $$
#variable_conflict use_column
declare
  betrieb text := app.betrieb();
  schluessel text := regexp_replace(trim(coalesce(p_baustelle, '')), '^PR-', '', 'i');
  grenze date;
begin
  if not (app.betriebsmitglied(betrieb) and app.ist_buch_oder_spitze()) then
    raise exception 'Ausgegebenes Material sieht nur, wer Rechnungen schreibt' using errcode = '42501';
  end if;
  if schluessel = '' then
    return;
  end if;

  select max(coalesce(i.leistung_bis, i.invoice_date)) into grenze
    from public.invoices i
   where i.company_id = betrieb
     and i.payment_status <> 'Storniert'
     and i.art <> 'anzahlung'
     and regexp_replace(trim(coalesce(i.project_number, '')), '^PR-', '', 'i') = schluessel;

  return query
  with ausgaben as (
    select 'anforderung'::text as art, o.id::text as beleg_id,
           (o.updated_at at time zone 'Europe/Vienna')::date as datum,
           o.material_id, o.material_name as name, m.unit as einheit, o.quantity as menge
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'order'
       and o.status = 'Erledigt'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    select 'retoure'::text, o.id::text,
           (o.created_at at time zone 'Europe/Vienna')::date,
           o.material_id, o.material_name, m.unit, -o.quantity
      from public.material_orders o
      left join public.materials m on m.id = o.material_id and m.company_id = o.company_id
     where o.company_id = betrieb
       and o.transaction_type = 'return'
       and regexp_replace(trim(coalesce(o.project_number, '')), '^PR-', '', 'i') = schluessel
    union all
    select 'ruestliste'::text, p.id, k.date,
           p.material_id, p.name, coalesce(nullif(p.einheit, ''), m.unit), p.menge
      from public.einsatz_material k
      join public.einsatz_material_positionen p on p.einsatz_material_id = k.id
      left join public.materials m on m.id = p.material_id and m.company_id = k.company_id
     where k.company_id = betrieb
       and regexp_replace(trim(k.project_number), '^PR-', '', 'i') = schluessel
       and k.geladen ? p.id::text
  )
  select a.art, a.beleg_id, a.datum, a.material_id, a.name, a.einheit, a.menge
    from ausgaben a
   where a.menge <> 0
     and (grenze is null or a.datum > grenze)
     and (p_bis is null or a.datum <= p_bis)
   order by a.datum, a.name, a.beleg_id;
end;
$$;

revoke all on function public.ausgegebenes_material(text, date) from public, anon;
grant execute on function public.ausgegebenes_material(text, date) to authenticated;
