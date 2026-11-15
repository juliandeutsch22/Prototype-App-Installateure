-- L4 (Paket 9, 17.11.2026): Vorschaubilder für Bilder im Chat.

/*
  WAS WAR. Ein Handyfoto ging unverkleinert hoch (3–8 MB) und wurde im
  Verlauf in voller Größe geladen — auf der Baustelle zweistellige Megabyte
  je Blick in ein Gespräch (Analyse 15.11.2026, B4).

  JETZT verkleinert das Gerät ein Bild vor dem Senden (längste Kante 1600,
  wie die Fotos am Schein) und legt ein kleines Vorschaubild daneben
  (`vorschau_pfad`). Der Verlauf zeigt das Vorschaubild, ein Tipp öffnet das
  Bild. Das Vorschaubild ist eine eigene Datei im selben Ordner der
  Nachricht, gehört aber zum Anhang: wer den Anhang lesen darf, liest es;
  geht der Anhang, geht es mit; der Nachtlauf hält es, solange der Anhang
  besteht.

  VERTRÄGLICH. Die Spalte ist frei; ältere Anhänge und ältere Fassungen der
  App (ohne `vorschau` in `p_anhaenge`) bleiben, wie sie sind — der Verlauf
  zeigt dann das Bild selbst. Ein Vorschaubild, das nicht oben liegt, hält
  die Nachricht nicht auf: sie geht ohne.

  Die Funktionen werden gezielt ergänzt (Textersatz mit Prüfung, dass die
  Stelle genau einmal vorkommt), nicht neu geschrieben; wiederholbar.
*/

alter table public.nachricht_anhaenge add column if not exists vorschau_pfad text;

comment on column public.nachricht_anhaenge.vorschau_pfad is
  'L4: kleines Vorschaubild des Anhangs (gleicher Eimer, Ordner der Nachricht); leer bei Dateien und älteren Bildern.';

do $migration$
declare
  quelle text;
  marke text;
  neu text;
begin
  ---------------------------------------------------------------- Lesen
  quelle := pg_get_functiondef('app.nachrichten_datei_lesbar(text,text)'::regprocedure);
  if position('vorschau_pfad' in quelle) = 0 then
    marke := 'where a.eimer = p_eimer and a.pfad = p_pfad';
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'L4: Stelle in app.nachrichten_datei_lesbar fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke, 'where a.eimer = p_eimer and (a.pfad = p_pfad or a.vorschau_pfad = p_pfad)');
  end if;

  ---------------------------------------------------------------- Schreiben: nie über ein gesendetes Vorschaubild
  quelle := pg_get_functiondef('app.nachrichten_datei_schreibbar(text,text)'::regprocedure);
  if position('vorschau_pfad' in quelle) = 0 then
    marke := 'select 1 from public.nachricht_anhaenge a where a.eimer = p_eimer and a.pfad = p_pfad';
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'L4: Stelle in app.nachrichten_datei_schreibbar fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke,
      'select 1 from public.nachricht_anhaenge a where a.eimer = p_eimer and (a.pfad = p_pfad or a.vorschau_pfad = p_pfad)');
  end if;

  ---------------------------------------------------------------- Nachtlauf: ein Vorschaubild mit Anhang bleibt
  quelle := pg_get_functiondef('public.nachrichten_dateien_offen(integer)'::regprocedure);
  if position('vorschau_pfad' in quelle) = 0 then
    marke := 'select 1 from public.nachricht_anhaenge a where a.eimer = k.eimer and a.pfad = k.pfad';
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'L4: Stelle in public.nachrichten_dateien_offen fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke,
      'select 1 from public.nachricht_anhaenge a where a.eimer = k.eimer and (a.pfad = k.pfad or a.vorschau_pfad = k.pfad)');
  end if;

  quelle := pg_get_functiondef('public.nachrichten_dateien_erledigt(jsonb)'::regprocedure);
  if position('vorschau_pfad' in quelle) = 0 then
    marke := 'select 1 from public.nachricht_anhaenge a where a.eimer = w.eimer and a.pfad = w.pfad';
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'L4: Stelle in public.nachrichten_dateien_erledigt fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke,
      'select 1 from public.nachricht_anhaenge a where a.eimer = w.eimer and (a.pfad = w.pfad or a.vorschau_pfad = w.pfad)');
  end if;

  ---------------------------------------------------------------- Entfernen: das Vorschaubild geht mit dem Anhang
  quelle := pg_get_functiondef('app.nachrichten_anhaenge_entfernen(uuid[])'::regprocedure);
  if position('vorschau_pfad' in quelle) = 0 then
    marke := 'select a.eimer, a.pfad from public.nachricht_anhaenge a where a.nachricht_id = any(p_nachrichten)';
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'L4: Stelle in app.nachrichten_anhaenge_entfernen fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke, marke || $e$
  union
  select a.eimer, a.vorschau_pfad from public.nachricht_anhaenge a
   where a.nachricht_id = any(p_nachrichten) and a.vorschau_pfad is not null$e$);
  end if;

  ---------------------------------------------------------------- Senden: Vorschaubild übernehmen, wenn es oben liegt
  quelle := pg_get_functiondef('public.nachricht_senden(uuid,uuid,text,jsonb,uuid[],timestamptz,uuid)'::regprocedure);
  if position('vorschau_pfad' in quelle) = 0 then
    marke := $m$    insert into public.nachricht_anhaenge (id, nachricht_id, kanal_id, company_id, eimer, pfad, name, bytes, inhaltsart, reihenfolge)
    values ((a ->> 'id')::uuid, p_id, k.id, ich.company_id, eimer, objekt.name,
            left(coalesce(nullif(btrim(a ->> 'name'), ''), 'Anhang'), 200), greatest(objekt.bytes, 1), objekt.art, nr);$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'L4: Stelle in public.nachricht_senden fehlt oder ist nicht eindeutig';
    end if;
    neu := $e$    -- L4: das Vorschaubild, wenn es als eigene Datei des Absenders im Ordner der Nachricht liegt — sonst ohne.
    insert into public.nachricht_anhaenge (id, nachricht_id, kanal_id, company_id, eimer, pfad, name, bytes, inhaltsart, reihenfolge, vorschau_pfad)
    values ((a ->> 'id')::uuid, p_id, k.id, ich.company_id, eimer, objekt.name,
            left(coalesce(nullif(btrim(a ->> 'name'), ''), 'Anhang'), 200), greatest(objekt.bytes, 1), objekt.art, nr,
            (select o.name from storage.objects o
              where coalesce(a ->> 'vorschau', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                and a ->> 'vorschau' is distinct from a ->> 'id'
                and o.bucket_id = eimer
                and o.name = format('nachrichten/%s/%s/%s/%s', ich.company_id, k.id, p_id, a ->> 'vorschau')
                and o.owner_id = ich.id::text));$e$;
    execute replace(quelle, marke, neu);
  end if;

  ---------------------------------------------------------------- Verlauf: das Vorschaubild mitliefern
  quelle := pg_get_functiondef('public.nachrichten_verlauf(uuid,timestamptz,uuid,integer)'::regprocedure);
  if position('vorschau_pfad' in quelle) = 0 then
    marke := $m$'bytes', a.bytes, 'inhaltsart', a.inhaltsart)$m$;
    if (length(quelle) - length(replace(quelle, marke, ''))) / length(marke) <> 1 then
      raise exception 'L4: Stelle in public.nachrichten_verlauf fehlt oder ist nicht eindeutig';
    end if;
    execute replace(quelle, marke, $e$'bytes', a.bytes, 'inhaltsart', a.inhaltsart,
                                                       'vorschau', a.vorschau_pfad)$e$);
  end if;
end;
$migration$;
