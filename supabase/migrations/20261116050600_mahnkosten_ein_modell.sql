-- Durchsicht 15.11.2026, G3: Mahnspesen und Verzugszinsen nach EINEM Modell
-- für Einstellung, Schreiben und Verbuchung.
--
-- NACHGESTELLT (Analyse 4-geld.md, M2; Prüfung
-- `tests/unit/mahnforderungEinModell.test.ts`): Die Einstellung zählte die
-- Spesen aller drei Stufen „je Rechnung“, das Schreiben forderte nur die
-- Spesen seiner Stufe, und die Verbuchung ließ „letzte Mahnung (Kosten +
-- Zinsen) minus ALLE bisherigen Mahnkosten-Eingänge“ zu. Spesen 5/10/15 €,
-- Rechnung 1.000 €: nach Mahnung 2 zahlt der Kunde 500 € und die
-- Mahnkosten, Mahnung 3 fordert Rest, 15 € und Zinsen — zahlt er genau das,
-- wird ein Teil Guthaben, und der Dialog schlägt die Rückzahlung vor.
--
-- DAS EINE MODELL: Jedes Schreiben fordert die Mahnkosten der Rechnung bis
-- zu seinem Tag — die Kosten aller bisherigen Mahnungen, wie sie dort
-- standen, die eigenen und die Verzugszinsen über die ganze Zeit des
-- Verzugs (je Tag auf den Betrag, der an ihm offen war) — und zieht ab, was
-- davon schon bezahlt ist. Die Summe steht als `forderung` im Inhalt der
-- Mahnung; `app.mahnforderung` nimmt genau sie, `app.mahnkosten_passt`
-- lässt also immer zu, was der Brief verlangt. Die Einstellung prüft die
-- Summe der drei Stufen (`companies_mahnspesen_grenze`) — das ist nun auch,
-- was eine Rechnung höchstens fordert. Die Pauschale nach § 458 UGB steht
-- einmal, auf der Mahnung (Stufe 2).
--
-- ALTDATEN: Mahnungen davor tragen keine `forderung`; für sie rechnet
-- `app.mahnforderung` wie bisher (Kosten + Zinsen der letzten Mahnung). Eine
-- neue Mahnung nach alten führt deren Kosten als „frühere Schreiben“ mit.
--
-- Verträglich mit der alten App: ihre Schreiben tragen keine `forderung` und
-- werden wie bisher festgehalten und verbucht.

create or replace function app.mahnforderung(p_invoice uuid) returns numeric
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select case
              -- G3: das Schreiben nennt die ganze Forderung — sie gilt, wie gedruckt.
              when m.inhalt ? 'forderung' then round((m.inhalt ->> 'forderung')::numeric, 2)
              else round(
                coalesce((m.inhalt ->> 'kosten')::numeric, m.spesen, 0)
                + coalesce(
                    (m.inhalt ->> 'zinsen')::numeric,
                    (select coalesce(sum(replace(regexp_replace(z ->> 1, '[^0-9,]', '', 'g'), ',', '.')::numeric), 0)
                       from jsonb_array_elements(
                              case when jsonb_typeof(m.inhalt -> 'zeilen') = 'array'
                                   then m.inhalt -> 'zeilen' else '[]'::jsonb end) z
                      where z ->> 0 like 'Verzugszinsen%'
                        and regexp_replace(coalesce(z ->> 1, ''), '[^0-9,]', '', 'g') <> ''),
                    0), 2)
            end
       from public.mahnungen m
      where m.invoice_id = p_invoice
      order by m.datum desc, m.angelegt_am desc
      limit 1),
    (select i.mahnspesen from public.invoices i
      where i.id = p_invoice and coalesce(i.mahnstufe, 0) > 0),
    0)
$$;

revoke all on function app.mahnforderung(uuid) from public, anon, authenticated;

/*
  `mahnung_festhalten` — die Fassung aus
  `20261116050200_rechnungsdatum_vom_server.sql`; dazu die Prüfung der
  Mahnforderung.
*/
create or replace function public.mahnung_festhalten(
  p_invoice uuid,
  p_stufe integer,
  p_datum date,
  p_frist date,
  p_spesen numeric,
  p_inhalt jsonb,
  p_datum_ausdruecklich boolean default false
) returns uuid
  language plpgsql
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
  rechnung public.invoices;
  neu uuid;
begin
  if p_stufe is null or p_stufe not between 1 and 3 then
    raise exception 'Mahnstufe 1 bis 3' using errcode = '22023';
  end if;
  if p_datum is null or p_frist is null or p_inhalt is null or jsonb_typeof(p_inhalt) <> 'object' then
    raise exception 'Tag, Frist und Inhalt der Mahnung fehlen' using errcode = '22023';
  end if;
  -- Ab dem Mahntag laufen Zinsen und die nächste Stufe — er kommt nicht vom Gerät (G5).
  if p_datum <> heute and not coalesce(p_datum_ausdruecklich, false) then
    raise exception 'Das Datum dieses Geräts (%) ist nicht der heutige Tag (%). Es wurde keine Mahnung festgehalten — bitte Datum und Uhrzeit des Geräts prüfen.',
      to_char(p_datum, 'DD.MM.YYYY'), to_char(heute, 'DD.MM.YYYY')
      using errcode = '22023';
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

  /*
    DIE MAHNFORDERUNG DES SCHREIBENS (G3): die Kosten aller bisherigen
    Mahnungen dieser Rechnung, die dieser Stufe und die Zinsen. Was hier
    steht, lässt die Verbuchung zu (`app.mahnforderung`) — also muss es zu
    den gespeicherten Mahnungen passen. Die Zinsen rechnet die App (Basiszins
    je Halbjahr, Eingänge mit Tag); geprüft wird die Summe.
  */
  if p_inhalt ? 'forderung' then
    if abs(coalesce((p_inhalt ->> 'kosten')::numeric, 0) - coalesce(p_spesen, 0)) > 0.005 then
      raise exception 'Die Kosten im Schreiben passen nicht zu den Mahnspesen — es wurde keine Mahnung festgehalten.'
        using errcode = '22023';
    end if;
    if abs((p_inhalt ->> 'forderung')::numeric - round(
           coalesce((select sum(m.spesen) from public.mahnungen m where m.invoice_id = p_invoice), 0)
           + coalesce(p_spesen, 0)
           + coalesce((p_inhalt ->> 'zinsen')::numeric, 0), 2)) > 0.01 then
      raise exception 'Die Mahnkosten im Schreiben passen nicht zu den früheren Mahnungen dieser Rechnung — es wurde keine Mahnung festgehalten. Bitte die Mahnung neu erzeugen.'
        using errcode = '22023';
    end if;
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

revoke all on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb, boolean) from public, anon;
grant execute on function public.mahnung_festhalten(uuid, integer, date, date, numeric, jsonb, boolean) to authenticated, service_role;
