/*
  DIE VORSAETZE GEHOEREN DEM BETRIEB, NICHT DEM QUELLTEXT.

  Vorgefunden wurden vier fest verdrahtete Zeichenfolgen:

    RE-   Rechnungen  — in `invoiceNumbers.ts` UND in `db/pg/invoices.ts`
    AN-   Angebote    — in `db/pg/quotes.ts` UND in `db/fs/quotes.ts`
    B-    Baustellen  — nirgends vergeben; die Nummer tippt ein Mensch
    WZ-   Kennzeichen — DREIFACH in `TimeForm.tsx`

  Der letzte ist derselbe Fehler wie das fest verdrahtete Firmenlogo vom
  15.09.: `WZ` ist der Kenner eines bestimmten Bezirks. Ein zweiter Betrieb
  haette ihn auf jedem Zeiteintrag stehen gehabt — und von dort wandert er in
  den Lohnexport.

  VIER SPALTEN UND KEIN JSON-FELD, obwohl `rates`, `cost_rates` und `modules`
  daneben JSON sind. Die Begruendung dort ist „Einstellungen, nach denen
  niemand filtert"; das trifft hier auch zu. Was hier dazukommt und dort
  fehlt: diese vier Werte brauchen eine HARTE FORMPRUEFUNG. Sie landen im
  Dateinamen des Rechnungs-PDFs und in der CSV fuer den Steuerberater, und ein
  `check` auf einer typisierten Spalte ist die einzige Sperre, an der auch ein
  direkter Schreibzugriff nicht vorbeikommt. Ueber ein JSON-Feld waere dafuer
  ein Trigger noetig — mehr Text fuer weniger Sicherheit.

  WER AENDERN DARF, STEHT SCHON DA: `companies_aendern` laesst nur
  `app.ist_spitze()` an diese Tabelle. Eine eigene Regel je Spalte waere eine
  zweite Wahrheit ueber dieselbe Frage.
*/

alter table companies
  add column praefix_rechnung    text,
  add column praefix_angebot     text,
  add column praefix_baustelle   text,
  add column praefix_kennzeichen text;

/*
  NULL HEISST „NICHT FESTGELEGT", LEER HEISST „AUSDRUECKLICH KEINER".

  Der Unterschied ist nicht akademisch: ohne ihn koennte ein Betrieb seinen
  Vorsatz nie loswerden — jede leere Eingabe fiele auf die Vorgabe zurueck.
  Ein Betrieb, der ohne Vorsatz zaehlt („2026-1001"), soll das koennen.

  Deshalb auch KEIN `default`: eine Vorgabe in der Spalte waere dieselbe
  Aussage wie ein fest verdrahteter Wert, nur an einer anderen Stelle. Die
  Vorgabe steht in `lib/praefixe.ts` und gilt genau fuer `null`.
*/
alter table companies
  add constraint companies_praefix_rechnung
    check (praefix_rechnung is null or praefix_rechnung ~ '^[A-Z0-9-]{0,6}$'),
  add constraint companies_praefix_angebot
    check (praefix_angebot is null or praefix_angebot ~ '^[A-Z0-9-]{0,6}$'),
  add constraint companies_praefix_baustelle
    check (praefix_baustelle is null or praefix_baustelle ~ '^[A-Z0-9-]{0,6}$'),
  add constraint companies_praefix_kennzeichen
    check (praefix_kennzeichen is null or praefix_kennzeichen ~ '^[A-Z0-9-]{0,6}$');

/*
  DEN BESTEHENDEN FUHRPARK UEBERNEHMEN — AUS DEN DATEN, NICHT AUS EINEM NAMEN.

  Wer bisher Zeiten gebucht hat, hat `WZ-` an seinen Kennzeichen stehen; ohne
  diese Zeile stuende morgen bei denselben Fahrzeugen nur noch die Ziffernfolge
  und die Lohnverrechnung saehe zwei Schreibweisen fuer ein Auto.

  Gesetzt wird ueber die VORHANDENEN ZEILEN und nicht ueber die Betriebskennung:
  `where company_id = 'perl'` waere kuerzer und waere genau der Fehler, den
  diese Migration behebt — eine Aussage ueber einen bestimmten Betrieb im
  Quelltext. So traegt die Regel auch fuer jeden weiteren Bestand, der mit der
  alten Fassung gearbeitet hat.
*/
update companies c
   set praefix_kennzeichen = 'WZ'
 where c.praefix_kennzeichen is null
   and exists (
     select 1 from time_entries t
      where t.company_id = c.id
        and t.vehicle_plate like 'WZ-%');

-- ---------------------------------------------------------------------------
-- Die Baustellennummer bekommt einen Zaehler
-- ---------------------------------------------------------------------------

/*
  DIE ZEILEN-PRUEFREGEL MUSS MIT. `number_counters.art` liess bisher nur
  `invoices` und `quotes` zu — ohne diese Zeile scheiterte der erste Versuch,
  eine Baustellennummer zu ziehen, an einer Pruefregel statt an der Rolle, und
  die Meldung naennte den falschen Grund.
*/
alter table number_counters drop constraint number_counters_art_check;
alter table number_counters
  add constraint number_counters_art_check
  check (art in ('invoices', 'quotes', 'projects'));

/*
  BISHER GAB ES KEINEN. Die Baustellennummer war ein Pflichtfeld, das ein
  Mensch tippt; automatisch entstand sie an genau einer Stelle — beim Annehmen
  eines Angebots, per Textersetzung `AN-` → `B-`.

  Damit waere ein einstellbarer Baustellen-Vorsatz eine Einstellung ohne
  Wirkung gewesen: es gaebe niemanden, der ihn anwendet. Also bekommt die
  Baustelle denselben gesperrten Zaehler wie Rechnung und Angebot.

  WER DARF: die Fuehrung — dieselbe Menge, die Baustellen ueberhaupt anlegen
  darf (`canManageProjects` / `projects`-Richtlinie). Die Buchhaltung ist
  ausdruecklich NICHT dabei, sie legt keine Baustellen an.

  DER VORSCHLAG BLEIBT UEBERSCHREIBBAR. Manche Betriebe fuehren die Nummer des
  Bautraegers oder des Architekten; ein Pflichtschema naehme ihnen das weg.
  Deshalb vergibt diese Funktion eine Nummer, und das Formular schlaegt sie
  vor — sie erzwingt keine.
*/
create or replace function public.naechste_nummer(
  p_art text,
  p_jahr integer,
  p_seed integer default 0,
  p_wunsch integer default null
) returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  betrieb text;
  letzte integer;
  neu integer;
begin
  betrieb := app.betrieb();
  if betrieb is null or not app.angemeldet() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  if p_art = 'invoices' and not app.ist_buch_oder_spitze() then
    raise exception 'Nur die Buchhaltung vergibt Rechnungsnummern' using errcode = '42501';
  end if;
  if p_art = 'quotes' and not (app.ist_fuehrung() or app.ist_buch_oder_spitze()) then
    raise exception 'Nur die Führung vergibt Angebotsnummern' using errcode = '42501';
  end if;
  if p_art = 'projects' and not app.ist_fuehrung() then
    raise exception 'Nur die Führung vergibt Baustellennummern' using errcode = '42501';
  end if;

  -- Anlegen, falls es den Zaehler nicht gibt — mit dem Altbestand als Stand.
  insert into public.number_counters (company_id, art, jahr, stand)
       values (betrieb, p_art, p_jahr, greatest(coalesce(p_seed, 0), 0))
  on conflict (company_id, art, jahr) do nothing;

  -- `for update` sperrt die Zeile fuer die Dauer der Transaktion. Zwei
  -- gleichzeitige Abrechnungen koennen sich damit nicht dieselbe Nummer
  -- holen: die zweite wartet und liest den bereits erhoehten Stand.
  select c.stand into letzte from public.number_counters c
   where c.company_id = betrieb and c.art = p_art and c.jahr = p_jahr
     for update;

  if p_wunsch is null then
    neu := case
             when letzte > 0 then letzte + 1
             when p_art = 'invoices' then 1001
             else 1
           end;
  else
    if p_wunsch < 1 then
      raise exception 'Eine Rechnungsnummer braucht eine ganze laufende Nummer.'
        using errcode = '22023';
    end if;
    if p_wunsch <= letzte then
      raise exception 'Die Nummer % ist bereits vergeben. Die nächste freie ist %.',
        to_char(p_wunsch, 'FM0000'), to_char(letzte + 1, 'FM0000')
        using errcode = '23505';
    end if;
    neu := p_wunsch;
  end if;

  update public.number_counters
     set stand = neu, updated_at = now()
   where company_id = betrieb and art = p_art and jahr = p_jahr;

  return neu;
end;
$$;

revoke all on function public.naechste_nummer(text, integer, integer, integer)
  from public, anon;
grant execute on function public.naechste_nummer(text, integer, integer, integer)
  to authenticated;
