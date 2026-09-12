-- Die Pruefsumme eines unterschriebenen Handwerksscheins — in der Datenbank.
--
-- Bisher eine Cloud Function, die nach dem Schreiben ansprang. Jetzt ein
-- Trigger, und das ist mehr als ein Ortswechsel: die Function lief NACH dem
-- Schreibvorgang und in einem eigenen Lauf; der Trigger laeuft in derselben
-- Transaktion und faengt JEDEN Weg. Ein Schein, der an
-- `schein_unterschreiben` vorbei unterschrieben wird — eine schlichte
-- Anweisung auf die Tabelle reicht dafuer —, bekommt seine Pruefsumme
-- trotzdem.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Die Reihenfolge der Fotos gehoert zum Beleg
-- ---------------------------------------------------------------------------

/*
  `kanonischerInhalt` schreibt die Fotos IN IHRER REIHENFOLGE in die
  Pruefsumme — genau wie die Positionen, und aus demselben Grund: eine
  umsortierte Liste ist ein anderer Beleg.

  Im Dokument war die Reihenfolge der Platz im Array. In einer Tabelle gibt es
  keine Reihenfolge, solange keine Spalte sie traegt; ohne sie muesste die
  Pruefsumme nach etwas anderem sortieren (dem Pfad etwa), und ein Schein, der
  unter Firestore unterschrieben wurde, liesse sich nach dem Umzug nicht mehr
  nachrechnen — sobald Hochlade- und Pfadreihenfolge auseinandergehen.
*/
alter table work_sheet_photos add column position integer not null default 0;
create index work_sheet_photos_reihenfolge on work_sheet_photos (work_sheet_id, position);

-- ---------------------------------------------------------------------------
-- Zahlen so schreiben, wie JavaScript sie schreibt
-- ---------------------------------------------------------------------------

/*
  DAS IST DER HEIKELSTE TEIL DER GANZEN UEBERSETZUNG.

  Die Pruefsumme entsteht ueber einer Zeichenkette, und die muss auf beiden
  Seiten ZEICHENGENAU dieselbe sein — sonst laesst sich ein Schein, der unter
  Firestore unterschrieben wurde, nach dem Umzug nicht mehr nachrechnen, und
  der Beleg ist genau dort wertlos, wo er beweisen soll.

  `numeric(12,3)` schreibt sich in Postgres als „2.500", in JavaScript als
  „2.5". Die Nullen muessen weg, der Punkt auch, wenn nichts mehr dahinter
  steht. Der Punkt schuetzt dabei die bedeutsamen Nullen: aus „10.000" wird
  „10" und nicht „1".
*/
create or replace function app.zahl_wie_js(wert numeric) returns text
  language sql immutable
  set search_path = ''
as $$
  select case
    when wert is null then '0'
    when position('.' in wert::text) = 0 then wert::text
    else rtrim(rtrim(wert::text, '0'), '.')
  end
$$;

/*
  `t()` in `shared/scheinHash.ts` ist `(v ?? '').trim()`.

  JavaScript entfernt dabei MEHR als nur Leerzeichen: Tabulator, Zeilenumbruch,
  Wagenruecklauf, Seitenvorschub, Vertikaltabulator, das geschuetzte
  Leerzeichen und die Byte-Order-Mark. Wer hier nur Leerzeichen abschneidet,
  bekommt bei einem Namen mit geschuetztem Leerzeichen am Ende eine ANDERE
  Pruefsumme als der Browser — und das faellt nie auf, weil beide Seiten fuer
  sich stimmig sind.
*/
create or replace function app.text_wie_js(wert text) returns text
  language sql immutable
  set search_path = ''
as $$
  select btrim(coalesce(wert, ''),
               ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13)
                   || chr(160) || chr(65279))
$$;

-- ---------------------------------------------------------------------------
-- Der kanonische Inhalt
-- ---------------------------------------------------------------------------

/*
  Feld fuer Feld und in fester Reihenfolge, genau wie `kanonischerInhalt`.
  Trenner ist das Unit-Separator-Zeichen (U+001F): es kommt in Freitext nicht
  vor. Mit einem Semikolon liesse sich die Pruefsumme austricksen — eine
  Taetigkeit „8;00" waere von zwei Feldern nicht zu unterscheiden.

  DIE REIHENFOLGE DER POSITIONEN IST TEIL DES INHALTS: eine umsortierte Liste
  ist ein anderer Beleg, auch wenn die Summe gleich bleibt. Deshalb ueberall
  `order by position`.

  `concat_ws` faellt hier aus: es LAESST NULL-Felder WEG statt sie als leeres
  Feld zu schreiben, und damit haette ein Schein ohne Anschrift ein Feld
  weniger als einer mit leerer Anschrift. `app.text_wie_js` macht aus NULL
  ohnehin einen leeren Text; verbunden wird deshalb von Hand.
*/
create or replace function app.schein_kanonisch(p_id uuid) returns text
  language plpgsql stable
  set search_path = ''
as $$
declare
  s public.work_sheets;
  tr constant text := chr(31);
  zeilen text[];
begin
  select * into s from public.work_sheets where id = p_id;
  if s.id is null then return null; end if;

  zeilen := array[array_to_string(array[
    'SCHEIN',
    app.text_wie_js(s.project_number), app.text_wie_js(s.customer_name),
    app.text_wie_js(s.address), to_char(s.datum, 'YYYY-MM-DD'),
    app.text_wie_js(s.abrechnung)], tr)];

  zeilen := zeilen || coalesce((
    select array_agg(array_to_string(array[
             'ZEIT',
             to_char(z.datum, 'YYYY-MM-DD'), app.text_wie_js(z.mitarbeiter),
             -- Die App kennt „07:00", die Spalte „07:00:00".
             app.text_wie_js(to_char(z.von, 'HH24:MI')),
             app.text_wie_js(to_char(z.bis, 'HH24:MI')),
             app.zahl_wie_js(z.pause_min), app.zahl_wie_js(z.minuten),
             app.text_wie_js(z.taetigkeit),
             case when z.helfer then '1' else '0' end], tr)
           order by z.position)
      from public.work_sheet_hours z where z.work_sheet_id = p_id), '{}');

  zeilen := zeilen || coalesce((
    select array_agg(array_to_string(array[
             'MATERIAL',
             app.text_wie_js(m.name), app.zahl_wie_js(m.menge),
             app.text_wie_js(m.einheit)], tr)
           order by m.position)
      from public.work_sheet_material m where m.work_sheet_id = p_id), '{}');

  /*
    Ein Schein OHNE Fotos schreibt hier gar nichts. Sonst aenderte allein das
    Einfuehren dieses Feldes die Pruefsumme jedes bestehenden Scheins, und
    keiner davon liesse sich mehr nachrechnen.
  */
  zeilen := zeilen || coalesce((
    select array_agg(array_to_string(array[
             'FOTO', app.text_wie_js(f.pfad), app.text_wie_js(f.hash)], tr)
           order by f.position)
      from public.work_sheet_photos f where f.work_sheet_id = p_id), '{}');

  zeilen := zeilen || array_to_string(array['NOTIZ', app.text_wie_js(s.notizen)], tr);

  if s.unterschrift_monteur is not null then
    zeilen := zeilen || array_to_string(array['MONTEUR',
      app.text_wie_js(s.unterschrift_monteur ->> 'name'),
      app.zahl_wie_js((s.unterschrift_monteur ->> 'geraetZeit')::numeric),
      app.text_wie_js(s.unterschrift_monteur ->> 'bild')], tr);
  end if;
  if s.unterschrift_kunde is not null then
    zeilen := zeilen || array_to_string(array['KUNDE',
      app.text_wie_js(s.unterschrift_kunde ->> 'name'),
      app.zahl_wie_js((s.unterschrift_kunde ->> 'geraetZeit')::numeric),
      app.text_wie_js(s.unterschrift_kunde ->> 'bild')], tr);
  end if;

  return array_to_string(zeilen, chr(10));
end;
$$;

-- ---------------------------------------------------------------------------
-- Der Hash
-- ---------------------------------------------------------------------------

create or replace function app.schein_hash(p_id uuid) returns text
  language sql stable
  set search_path = ''
as $$
  select case
    when app.schein_kanonisch(p_id) is null then null
    else encode(extensions.digest(app.schein_kanonisch(p_id), 'sha256'), 'hex')
  end
$$;

-- ---------------------------------------------------------------------------
-- Der Riegel bekommt eine Ausnahme — und zwar eine, die nichts durchlaesst
-- ---------------------------------------------------------------------------

/*
  EIN UNTERSCHRIEBENER SCHEIN IST ZU, AUCH FUER DIE PRUEFSUMME — dachte ich.
  Der Trigger `app.schein_zustandswechsel` weist jede Aenderung an einem
  unterschriebenen Schein ab, und das schloss den Nachtrag des Hashes ein.
  Unter Firestore lief die Berechnung ueber das Admin-SDK und damit an den
  Regeln vorbei; in Postgres gibt es diesen Weg nicht, und das ist gut so.

  Die Ausnahme lautet deshalb NICHT „der Trigger darf". Sie lautet: es darf
  sich AUSSCHLIESSLICH `inhalt_hash` aendern, er muss vorher leer gewesen
  sein, und der neue Wert muss der RICHTIGE sein — der, den
  `app.schein_hash` ueber den eingefrorenen Inhalt rechnet.

  Damit ist die Ausnahme kein Loch: wer eine gefaelschte Pruefsumme
  unterschieben will, kommt nicht durch, und wer die richtige schreibt,
  schreibt genau das, was ohnehin dort stuende. Ein Kennzeichen „ich bin der
  Trigger" waere schwaecher gewesen — es haette geprueft, WER schreibt,
  statt WAS geschrieben wird.

  EINE OFFENE ZEILE, UND SIE SEI BENANNT: der Vergleich mit
  `app.schein_hash` ist die ZWEITE Sperre. Eine Mutation hat gezeigt, dass
  ohne ihn nichts kaputtgeht — weil die erste Sperre schon schliesst: ein
  Entwurf nimmt keine Pruefsumme an, und nach dem Unterschreiben setzt der
  Trigger sie sofort. Das Fenster „unterschrieben, Hash leer" ist von aussen
  nicht erreichbar. Der Vergleich bleibt trotzdem stehen: er ist die
  unmittelbare Formulierung der Regel, er kostet einen Vergleich, und er
  traegt genau dann, wenn die Berechnung einmal fehlschlaegt und der Hash
  tatsaechlich leer bleibt. Eine Pruefung dafuer gibt es nicht — dieser
  Zustand laesst sich von aussen nicht herstellen.
*/
create or replace function app.schein_zustandswechsel() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() then return new; end if;

  if old.status = 'Entwurf' then return new; end if;

  -- Die Pruefsumme nachtragen: nur sie, nur einmal, und nur die richtige.
  if new.status = old.status
     and old.inhalt_hash is null
     and new.inhalt_hash is not null
     and app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['inhalt_hash'])
     and new.inhalt_hash = app.schein_hash(new.id) then
    return new;
  end if;

  if old.status = 'Verworfen' and new.status = 'Entwurf' then
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new), array['status']) then
      raise exception 'Beim Zurückholen ändert sich nur der Zustand, nicht der Inhalt'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if old.status = 'Unterschrieben' and new.status = 'Storniert' then
    if not app.ist_fuehrung() then
      raise exception 'Nur die Führung darf einen unterschriebenen Schein stornieren'
        using errcode = '42501';
    end if;
    if coalesce(new.storno_grund, '') = '' then
      raise exception 'Ein Storno braucht einen Grund' using errcode = '42501';
    end if;
    if not app.nur_diese_felder(to_jsonb(old), to_jsonb(new),
                                array['status', 'storno_grund', 'storniert_von_name']) then
      raise exception 'Der Storno ist eine Klammer um den Beleg, keine Gelegenheit ihn zu ändern'
        using errcode = '42501';
    end if;
    return new;
  end if;

  raise exception 'Ein Schein im Zustand % lässt sich nicht mehr ändern (Ziel: %)',
    old.status, new.status using errcode = '42501';
end;
$$;

-- ---------------------------------------------------------------------------
-- Der Trigger
-- ---------------------------------------------------------------------------

/*
  GENAU EINMAL, beim Uebergang nach „Unterschrieben". Ein Entwurf aendert sich
  noch; ein Storno laesst die Pruefsumme unberuehrt, denn er aendert den Inhalt
  nicht.

  EIN FEHLSCHLAG DARF DEN SCHEIN NICHT KOSTEN. Unter Firestore lief die
  Berechnung in einem eigenen Lauf: ging sie schief, stand die Unterschrift
  trotzdem, und das PDF sagte ausdruecklich, dass die Pruefsumme fehlt. Als
  Trigger in derselben Transaktion wuerde ein Fehler das Unterschreiben
  zurueckrollen — der Monteur stuende vor dem Kunden und koennte nicht
  abschliessen. Deshalb faengt die Funktion alles ab und laesst den Hash im
  Zweifel leer.

  Die Anweisung aendert dieselbe Zeile und loest den Trigger erneut aus; beim
  zweiten Mal ist `inhalt_hash` gesetzt, die Bedingung trifft nicht mehr zu,
  und es ist Schluss.
*/
create or replace function app.schein_pruefsumme_setzen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  hash text;
begin
  begin
    hash := app.schein_hash(new.id);
    if hash is not null then
      update public.work_sheets set inhalt_hash = hash where id = new.id;
    end if;
  exception when others then
    null;
  end;
  return null;
end;
$$;

create trigger work_sheets_pruefsumme
  after update on work_sheets
  for each row
  when (new.status = 'Unterschrieben' and new.inhalt_hash is null)
  execute function app.schein_pruefsumme_setzen();

-- ---------------------------------------------------------------------------
-- Ein Entwurf hat keine Pruefsumme — und darf auch keine bekommen
-- ---------------------------------------------------------------------------

/*
  GEFUNDEN BEIM SCHREIBEN DER PRUEFUNG, UND ES WAR EIN LOCH.

  Der Nachtrag-Trigger springt nur an, wenn `inhalt_hash` LEER ist. Am
  Entwurf lässt `app.schein_zustandswechsel` jede Aenderung zu — er ist ja
  noch in Arbeit. Ein Monteur konnte also am Entwurf eine beliebige
  Pruefsumme eintragen und danach unterschreiben: der Trigger sah ein
  gefuelltes Feld, rechnete nicht nach, und auf dem Beleg stand eine
  Pruefsumme, die der Client sich ausgedacht hatte. Genau das, was die
  Pruefsumme ausschliessen soll.

  Die Abhilfe ist einfacher als jede Rechteregel: EIN ENTWURF HAT KEINE
  PRUEFSUMME. Was der Client hineinschreibt, wird beim Speichern verworfen.
  Damit gibt es genau einen Weg, auf dem ein Hash entsteht — den Trigger beim
  Unterschreiben —, und genau einen Wert, den er annimmt.
*/
create or replace function app.schein_hash_nur_unterschrieben() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if new.status = 'Entwurf' or new.status = 'Verworfen' then
    new.inhalt_hash := null;
  end if;
  return new;
end;
$$;

/*
  `a_` im Namen, damit dieser Trigger VOR `work_sheets_zustand` laeuft:
  Postgres ruft gleichrangige Trigger in alphabetischer Reihenfolge auf, und
  der Zustandswaechter soll die bereits bereinigte Zeile sehen.
*/
create trigger a_work_sheets_hash_nur_unterschrieben
  before insert or update on work_sheets
  for each row execute function app.schein_hash_nur_unterschrieben();
