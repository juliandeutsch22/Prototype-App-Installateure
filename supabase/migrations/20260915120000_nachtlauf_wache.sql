/*
  DER WÄCHTER ÜBER DEM NACHTLAUF.

  WAS HIER FEHLTE — und es ist genau der Fehler, der sich selbst versteckt:
  `net.http_post` wartet nicht auf die Antwort. Der Anstoss gilt als getan,
  sobald er in der Warteschlange liegt. Kommt danach eine 401 zurück, weil ein
  Schlüssel nicht stimmt, oder gar nichts, weil die Adresse falsch ist, landet
  das in `net._http_response` — und dort sieht niemand hin.

  `system_laeufe`, die Tabelle, aus der die Überwachungsansicht liest, bleibt
  in diesem Fall LEER: geschrieben wird sie von der Edge Function, und die ist
  ja nie angelaufen. In der Ansicht stünde also nicht „Ausleitung
  fehlgeschlagen", sondern gar nichts — und gar nichts sieht aus wie „noch
  nie gelaufen" und nicht wie „seit drei Wochen kaputt".

  Das ist kein gedachtes Beispiel. Bei der Einrichtung des echten Projekts ist
  genau das dreimal passiert, und gefunden wurde es jedes Mal von Hand.

  WIE ER ARBEITET. Der Anstoss merkt sich die Nummer seiner Anfrage. Eine
  Viertelstunde später sieht der Wächter nach, was daraus geworden ist:

    200                  → in Ordnung, der Merkzettel wird weggeworfen
    etwas anderes        → Fehlschlag in `system_laeufe`, für JEDEN Betrieb
    noch keine Antwort   → erst nach einer Stunde ein Fehlschlag

  WARUM FÜR JEDEN BETRIEB. Scheitert der Anstoss, ist der Lauf für alle
  ausgefallen — die Function hat ja keinen einzigen Betrieb gesehen. Ein
  Eintrag pro Betrieb ist damit die Wahrheit, und er erscheint dort, wo die
  Geschäftsführung jedes Betriebs ohnehin hinsieht.

  WAS ER NICHT TUT: die Push-Meldungen überwachen. Die sind nicht nächtlich,
  sondern hundertfach am Tag, und ihr Fehlschlag gehört nicht in eine Tabelle,
  die einen Lauf je Betrieb kennt. Das bleibt offen und steht hier, damit es
  nicht als erledigt gilt.
*/

/*
  Der Merkzettel. Eine Zeile je angestossener Anfrage, und sie verschwindet,
  sobald der Wächter sie beurteilt hat.
*/
create table if not exists app.anstoss_wache (
  anfrage      bigint primary key,
  art          text not null,
  angestossen  timestamptz not null default now()
);

create or replace function app.ausleitung_anstossen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text;
  schluessel text;
  anfrage bigint;
begin
  select decrypted_secret into adresse
    from vault.decrypted_secrets where name = 'ausleitung_url';
  select decrypted_secret into schluessel
    from vault.decrypted_secrets where name = 'ausleitung_schluessel';

  if adresse is null or schluessel is null then
    raise warning 'Ausleitung nicht eingerichtet: ausleitung_url oder ausleitung_schluessel fehlt im Tresor.';
    return;
  end if;

  select net.http_post(
    url := adresse,
    headers := app.anstoss_kopfzeilen(schluessel),
    body := jsonb_build_object('quelle', 'nachtlauf'),
    -- Ein grosser Betrieb liest seinen ganzen Bestand. Die Vorgabe von fuenf
    -- Sekunden reicht dafuer nicht; `net.http_post` wartet ohnehin nicht auf
    -- die Antwort, aber die Verbindung darf nicht vorher fallen.
    timeout_milliseconds := 300000)
  into anfrage;

  insert into app.anstoss_wache (anfrage, art) values (anfrage, 'ausleitung');
end;
$$;

create or replace function app.ausleitung_nachsehen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  zettel record;
  antwort record;
  meldung text;
begin
  for zettel in
    select * from app.anstoss_wache where art = 'ausleitung' order by anfrage
  loop
    select * into antwort from net._http_response r where r.id = zettel.anfrage;

    if antwort.id is null then
      /*
        Noch keine Antwort. Kurz nach dem Anstoss ist das der Normalfall —
        die Function liest ja gerade. Nach einer Stunde ist es keiner mehr:
        die Zeitgrenze des Aufrufs liegt bei fünf Minuten.

        `pg_net` räumt alte Antworten nach einigen Stunden weg. Der Wächter
        läuft eine Viertelstunde nach dem Anstoss und kommt ihm damit zuvor.
      */
      if zettel.angestossen > now() - interval '1 hour' then
        continue;
      end if;
      meldung := 'Keine Antwort auf den Anstoss der Ausleitung.';

    elsif antwort.status_code = 200 then
      delete from app.anstoss_wache where anfrage = zettel.anfrage;
      continue;

    else
      /*
        Abgeschnitten wird bei 300 Zeichen: die Meldung steht in einer
        Übersichtskarte, und eine seitenlange Fehlerseite macht sie
        unlesbar, ohne mehr zu sagen.
      */
      meldung := format(
        'Die Ausleitung antwortete mit %s: %s',
        coalesce(antwort.status_code::text, 'einem Fehler'),
        left(coalesce(nullif(antwort.error_msg, ''), antwort.content, ''), 300));
    end if;

    perform public.lauf_festhalten(c.id, 'ausleitung', false, meldung)
      from public.companies c;

    delete from app.anstoss_wache where anfrage = zettel.anfrage;
  end loop;

  /*
    Ein Sicherheitsnetz gegen das Anwachsen: ein Merkzettel, der eine Woche
    lang niemanden interessiert hat, gehört nicht mehr in die Tabelle. Ohne
    das bliebe jede Zeile liegen, deren Antwort `pg_net` schon weggeräumt hat,
    bevor der Wächter das erste Mal lief.
  */
  delete from app.anstoss_wache where angestossen < now() - interval '7 days';
end;
$$;

/*
  EINE VIERTELSTUNDE NACH DEM ANSTOSS — in UTC, wie alles in `pg_cron`.

  01:30 stösst an, 01:45 sieht nach. Der Aufruf selbst gibt nach fünf Minuten
  auf; die Viertelstunde lässt also Luft und kommt trotzdem lange vor dem
  Arbeitsbeginn zu einem Ergebnis.
*/
do $$
begin
  perform cron.unschedule('ausleitung-wache');
exception when others then
  -- Beim ersten Einspielen gibt es ihn noch nicht.
  null;
end;
$$;

do $$
begin
  perform cron.schedule('ausleitung-wache', '45 1 * * *', 'select app.ausleitung_nachsehen()');
exception when others then
  raise warning 'Der Waechter konnte nicht eingeplant werden: %', sqlerrm;
end;
$$;
