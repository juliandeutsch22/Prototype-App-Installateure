/*
  DAS ÄNDERUNGSPROTOKOLL DER ZEITBUCHUNGEN (E50, 05.11.2026)

  WAS FEHLTE. An einer Buchung stand nur, wer sie zuletzt geändert hat
  (`last_edited_by`) und wann (`updated_at`). Was vorher dastand, wer sie
  davor geändert hat und dass es eine gelöschte Buchung überhaupt gab, sah
  niemand. Für eine Arbeitszeitaufzeichnung (§ 26 AZG), auf die sich Lohn,
  Überstunden und Rechnungen stützen, ist das zu wenig: bei einer Rückfrage —
  vom Mitarbeiter, von der Prüfung, im Streit — muss sich zeigen lassen, was
  ursprünglich gebucht war und wer was geändert hat.

  WAS SICH ÄNDERT.
  - `zeitbuchung_verlauf`: je Anlegen, Ändern und Löschen einer Buchung eine
    Zeile — wer (Kennung und Name zum Zeitpunkt), wann, und was: beim Anlegen
    und Löschen der ganze Stand, beim Ändern je geänderter Spalte alt und neu.
  - Geschrieben ausschließlich vom Trigger an `time_entries`. Niemand kann
    eine Zeile anlegen, ändern oder löschen; es gibt dafür keine Regel und
    kein Recht. Das Protokoll ist nur dann etwas wert, wenn es sich nicht
    nachträglich glätten lässt.
  - Lesen dürfen genau die, die die Buchung lesen dürfen: die Person selbst,
    Buchhaltung und Führung (dieselbe Regel wie `time_entries_lesen`).
  - Nicht protokolliert werden Spalten, die nichts Neues sagen: Zeitstempel,
    der Bearbeitungsvermerk (steht als „wer“ in der Zeile) und was die
    Datenbank selbst aus den Zeiten rechnet (`hours`, `satz`).
  - Der Dienstschlüssel schreibt keine Zeilen — wie bei den
    Lagerbewegungen. Mit ihm laufen nur der Rücklauf einer Sicherung (der
    das Protokoll aus der Sicherung mitbringt; eigene Zeilen verdoppelten
    es), das Löschen eines ganzen Betriebs (dann geht auch das Protokoll)
    und die Prüfungen. Kein Ablauf der App ändert Buchungen mit ihm.

  BESTEHENDE BUCHUNGEN haben keinen Verlauf vor heute (Altdaten: was vorher
  geändert wurde, weiß niemand mehr). Ihre erste Änderung trägt den Stand
  davor als „alt“; die Ansicht sagt, seit wann aufgezeichnet wird.

  DATENSCHUTZ. Die Zeilen sind Teil der Arbeitszeitaufzeichnung: sie gehen in
  die Datenauskunft der Person (`person_auskunft`), bleiben bei ihrer
  Löschung mit den Buchungen aufbewahrt (§ 132 BAO, wie die Buchungen) und
  gehen mit dem Betrieb in den Datenauszug (`company_id`).
*/

create table if not exists public.zeitbuchung_verlauf (
  id uuid primary key default gen_random_uuid(),
  company_id text not null references public.companies(id),
  eintrag_id uuid not null,
  user_id uuid not null,
  datum date not null,
  art text not null,
  aenderungen jsonb not null default '{}'::jsonb,
  von_uid uuid,
  von_name text,
  am timestamptz not null default clock_timestamp(),
  constraint zeitbuchung_verlauf_art check (art in ('angelegt', 'geaendert', 'geloescht'))
);

/*
  KEINE FREMDSCHLÜSSEL AUF BUCHUNG UND PERSON. Der Verlauf einer gelöschten
  Buchung bleibt, und ein Protokoll soll nichts festhalten: hinge es am Konto,
  ließe sich ein Konto, dessen Buchungen gelöscht sind, nie mehr entfernen.
  Die Kennungen kommen ohnehin nur aus dem Trigger, also aus einer gültigen
  Buchung. Am Betrieb hängt es wie alles: mit ihm geht es.

  KEINE ZÄHLNUMMER ALS SCHLÜSSEL. Der Rücklauf spielt die Zeilen mit ihrer
  Kennung zurück; eine Zählung der Datenbank nähme sie nicht an (`always`)
  oder vergäbe danach dieselben Nummern noch einmal (`by default`). Die
  Reihenfolge trägt `am` — die Uhrzeit des Schreibens, nicht der
  Transaktion, damit Anlegen und Ändern in einem Zug nacheinander stehen.
*/
create index if not exists zeitbuchung_verlauf_eintrag on public.zeitbuchung_verlauf (company_id, eintrag_id, am);
create index if not exists zeitbuchung_verlauf_person on public.zeitbuchung_verlauf (company_id, user_id, datum);

comment on table public.zeitbuchung_verlauf is
  'Änderungsprotokoll der Zeitbuchungen (E50): Anlegen, Ändern, Löschen — wer, wann, was. Nur vom Trigger geschrieben; lesen wie die Buchung.';

alter table public.zeitbuchung_verlauf enable row level security;
revoke all on public.zeitbuchung_verlauf from public, anon, authenticated;
grant select on public.zeitbuchung_verlauf to authenticated;

drop policy if exists zeitbuchung_verlauf_lesen on public.zeitbuchung_verlauf;
create policy zeitbuchung_verlauf_lesen on public.zeitbuchung_verlauf for select
  using (company_id = (select app.lesebetrieb())
         and (user_id = (select auth.uid()) or (select app.ist_buch_oder_spitze())));

/*
  Der Support sieht keine Zeitbuchungen, also auch ihr Protokoll nicht — und
  der Riegel liegt hier wie auf jeder Tabelle mit Betrieb, obwohl ohnehin
  niemand schreiben darf: fiele eines Tages ein Recht dazu, bliebe er.
*/
drop trigger if exists zeitbuchung_verlauf_support_niemals on public.zeitbuchung_verlauf;
create trigger zeitbuchung_verlauf_support_niemals
  before insert or update or delete on public.zeitbuchung_verlauf
  for each row execute function app.support_niemals();

/*
  DER SCHREIBER. `security definer`, weil niemand sonst in die Tabelle
  schreiben darf; `after`, damit er sieht, was die übrigen Trigger aus der
  Zeile gemacht haben (Stunden, Satz, Nacht) — protokolliert wird, was
  wirklich gespeichert ist.
*/
create or replace function app.zeitbuchung_protokollieren() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  ohne constant text[] := array['created_at', 'updated_at', 'last_edited_by', 'last_edited_by_uid', 'hours', 'satz'];
  zeile public.time_entries := coalesce(new, old);
  alt jsonb;
  neu jsonb;
  spalte text;
  unterschied jsonb := '{}'::jsonb;
  inhalt jsonb;
  art text;
begin
  -- Rücklauf, Löschen eines Betriebs, Prüfungen: siehe oben.
  if app.ist_dienst() then
    return null;
  end if;

  if tg_op = 'INSERT' then
    art := 'angelegt';
    inhalt := to_jsonb(new) - ohne;
  elsif tg_op = 'DELETE' then
    art := 'geloescht';
    inhalt := to_jsonb(old) - ohne;
  else
    alt := to_jsonb(old);
    neu := to_jsonb(new);
    for spalte in select jsonb_object_keys(neu) loop
      if not (spalte = any(ohne)) and alt -> spalte is distinct from neu -> spalte then
        unterschied := unterschied || jsonb_build_object(spalte, jsonb_build_object('alt', alt -> spalte, 'neu', neu -> spalte));
      end if;
    end loop;
    if unterschied = '{}'::jsonb then
      return null;
    end if;
    art := 'geaendert';
    inhalt := unterschied;
  end if;

  insert into public.zeitbuchung_verlauf (company_id, eintrag_id, user_id, datum, art, aenderungen, von_uid, von_name)
  values (
    zeile.company_id, zeile.id, zeile.user_id, zeile.date, art, inhalt,
    auth.uid(),
    (select u.name from public.users u where u.id = auth.uid())
  );
  return null;
end;
$$;

revoke all on function app.zeitbuchung_protokollieren() from public, anon, authenticated;

drop trigger if exists time_entries_verlauf on public.time_entries;
create trigger time_entries_verlauf
  after insert or update or delete on public.time_entries
  for each row execute function app.zeitbuchung_protokollieren();

-- ---------------------------------------------------------------------------
-- Datenauskunft: der Verlauf der eigenen Buchungen, und als Bearbeiter die Anzahl
-- ---------------------------------------------------------------------------

/*
  Gezielt eingefügt wie in 20261031210000_r7_anforderung_status.sql;
  wiederholbar, und ohne Einfügestelle bricht die Migration ab.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('zeitbuchungen_verlauf' in quelle) = 0 then
    marke := $m$from public.time_entries t where t.company_id = betrieb and t.user_id = p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle Zeitbuchungen fehlt'; end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      'zeitbuchungen_verlauf', (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'buchung', v.eintrag_id, 'tag', v.datum, 'art', v.art, 'aenderungen', v.aenderungen,
                 'von', v.von_name, 'am', v.am) order by v.am, v.id), '[]'::jsonb)
          from public.zeitbuchung_verlauf v where v.company_id = betrieb and v.user_id = p_id),$eintrag$);
    marke := $m$where t.company_id = betrieb and t.angelegt_von = p_id and t.user_id <> p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle Bearbeiter fehlt'; end if;
    quelle := replace(quelle, marke, marke || $eintrag$
      -- E50: Änderungen an den Buchungen anderer, laut Protokoll.
      'zeitbuchungen_verlauf_fuer_andere', (select count(*) from public.zeitbuchung_verlauf v
        where v.company_id = betrieb and v.von_uid = p_id and v.user_id <> p_id),$eintrag$);
    execute quelle;
  end if;
end;
$migration$;

-- ---------------------------------------------------------------------------
-- Löschung einer Person: der Verlauf bleibt mit den Buchungen aufbewahrt
-- ---------------------------------------------------------------------------

do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_loeschen(text,uuid,boolean)'::regprocedure);
  if position('Änderungsprotokoll der Zeitbuchungen' in quelle) = 0 then
    marke := $m$from public.time_entries t where t.company_id = betrieb and t.user_id = p_id
        union all$m$;
    if position(marke in quelle) = 0 then raise exception 'Löschung: Einfügestelle Zeitbuchungen fehlt'; end if;
    execute replace(quelle, marke, $eintrag$from public.time_entries t where t.company_id = betrieb and t.user_id = p_id
        union all
        -- E50: das Änderungsprotokoll gehört zur Arbeitszeitaufzeichnung und bleibt mit ihr.
        select jsonb_build_object('was', 'Änderungsprotokoll der Zeitbuchungen', 'anzahl', count(*),
                                  'bis', max(app.aufbewahrt_bis(v.datum)), 'grund', rechtsgrund)
          from public.zeitbuchung_verlauf v where v.company_id = betrieb and v.user_id = p_id
        union all$eintrag$);
  end if;
end;
$migration$;
