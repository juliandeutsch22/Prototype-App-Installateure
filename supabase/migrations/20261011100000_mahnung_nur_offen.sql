/*
  EINE MAHNUNG NUR FÜR, WAS NOCH OFFEN IST — UND JEDE STUFE NUR EINMAL
  (gefunden beim Gegenlesen am 11.10.2026)

  `mahnung_festhalten` nahm jede Mahnung an, die die App schickte. Die App
  prüft vorher (`darfMahnen`) — aber an dem Stand, den sie gerade zeigt. Und
  der war im Mahnlauf der vom Öffnen der Seite (Messung 11.10.2026, lokaler
  Stack): nach einer Zahlungserinnerung stand die Rechnung dort weiter mit
  „Mahnen“, ein zweiter Klick hielt dieselbe Stufe noch einmal fest. Ebenso
  hätte eine Rechnung, die inzwischen bezahlt oder storniert ist, eine
  Mahnung bekommen — auch von einem zweiten Gerät aus, das noch den alten
  Stand zeigt.

  Darum fragt die Datenbank selbst, am Stand, der gilt:
    - Nichts mehr offen (bezahlt, überzahlt, storniert, Rest null): keine
      Mahnung. Dieselbe Regel wie `darfMahnen` und die offenen Posten.
    - Die Stufe muss die nächste sein. Zweimal dieselbe hieße ein zweites
      Schreiben mit neuer Frist für dieselbe Forderung; eine übersprungene
      eine dritte Mahnung ohne die zweite davor.

  DIE ZEILE WIRD GESPERRT (`for update`), bevor geprüft wird. Zwei Geräte,
  die zugleich mahnen, kommen nacheinander dran; das zweite sieht die Stufe
  des ersten und wird abgewiesen.

  NICHT HIER: Zahlungsziel, laufende Frist und ein noch nicht fälliger
  Rücklass. Sie hängen am Tag, und den kennt die App (`todayStr`, Wien);
  sie prüft sie unmittelbar vor dem Beleg an der frisch gelesenen Rechnung.
  Eine zweite Fassung derselben Regeln hier liefe früher oder später
  auseinander (siehe `20261010700000_mahnungen_einzeln.sql`).

  Sonst unverändert: Rechte des Aufrufers, Kundenart, „Überfällig“ nur aus
  „Offen“, Schreiben und Stand in einem Zug.
*/

create or replace function public.mahnung_festhalten(
  p_invoice uuid,
  p_stufe integer,
  p_datum date,
  p_frist date,
  p_spesen numeric,
  p_inhalt jsonb
) returns uuid
  language plpgsql
  security invoker
  set search_path = ''
as $$
declare
  rechnung public.invoices;
  neu uuid;
begin
  if p_stufe is null or p_stufe not between 1 and 3 then
    raise exception 'Mahnstufe 1 bis 3' using errcode = '22023';
  end if;
  if p_datum is null or p_frist is null or p_inhalt is null or jsonb_typeof(p_inhalt) <> 'object' then
    raise exception 'Tag, Frist und Inhalt der Mahnung fehlen' using errcode = '22023';
  end if;

  -- Durch denselben Zeilenschutz wie das Ändern: wer nicht mahnen darf, findet sie nicht.
  select * into rechnung from public.invoices i where i.id = p_invoice for update;
  if rechnung.id is null then
    raise exception 'Diese Rechnung gibt es hier nicht, oder sie darf von hier aus nicht gemahnt werden'
      using errcode = '42501';
  end if;

  if rechnung.payment_status = 'Storniert' then
    raise exception 'Die Rechnung ist inzwischen storniert — es wurde keine Mahnung festgehalten.'
      using errcode = '22023';
  end if;
  if rechnung.payment_status in ('Bezahlt', 'Überzahlt') or rechnung.total_brutto - rechnung.bezahlt_betrag <= 0 then
    raise exception 'Die Rechnung ist inzwischen bezahlt — es wurde keine Mahnung festgehalten.'
      using errcode = '22023';
  end if;
  if p_stufe <= rechnung.mahnstufe then
    raise exception 'Die Rechnung ist inzwischen schon mit Stufe % gemahnt — es wurde keine weitere Mahnung festgehalten.',
      rechnung.mahnstufe
      using errcode = '22023';
  end if;
  if p_stufe > rechnung.mahnstufe + 1 then
    raise exception 'Vor Stufe % muss Stufe % gemahnt sein.', p_stufe, rechnung.mahnstufe + 1
      using errcode = '22023';
  end if;

  update public.invoices i
     set mahnstufe = p_stufe,
         gemahnt_am = p_datum,
         mahnfrist = p_frist,
         mahnspesen = p_spesen,
         payment_status = case when i.payment_status = 'Offen' then 'Überfällig' else i.payment_status end
   where i.id = p_invoice;

  perform set_config('app.mahnung_legt', 'ja', true);
  insert into public.mahnungen (company_id, invoice_id, stufe, datum, frist, spesen, inhalt)
  values (rechnung.company_id, p_invoice, p_stufe, p_datum, p_frist, coalesce(p_spesen, 0), p_inhalt)
  returning id into neu;
  perform set_config('app.mahnung_legt', '', true);

  return neu;
end;
$$;

revoke all on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb) from public, anon;
grant execute on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb) to authenticated;
