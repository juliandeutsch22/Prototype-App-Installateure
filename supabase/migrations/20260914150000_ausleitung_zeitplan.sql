-- Der naechtliche Ausleitungslauf — Zeitplan und Ausloeser.
--
-- WOFUER. Faellt das Projekt aus, wird der Zugang gesperrt oder loescht jemand
-- versehentlich eine Tabelle, sind die Daten des Betriebs nicht greifbar:
-- Rechnungen, Zeitkonten, Kundenstamm. Das ist die einzige Luecke, die nicht
-- nur die App betrifft, sondern den Betrieb.
--
-- WIE. `pg_cron` weckt nachts eine Edge Function; die liest den Bestand
-- seitenweise, schreibt ihn zeilenweise weg und haelt das Ergebnis in
-- `system_laeufe` fest — dieselbe Ueberwachung wie bisher, also bleibt die
-- Anzeige „Sicherung ueberfaellig" in der Ansicht unveraendert.
--
-- WARUM NICHT ALLES IN SQL. Aus einer Datenbankfunktion heraus laesst sich
-- keine Datei schreiben. Das Lesen koennte hier stehen, das Wegschreiben
-- nicht — und eine Aufteilung, bei der die Haelfte hier und die Haelfte dort
-- liegt, waere schwerer zu verstehen als eine klare Grenze.

/*
  DIE ERWEITERUNGEN, UND WARUM SIE IN EINEM AUSNAHMEBLOCK STEHEN.

  Auf dem gehosteten Projekt duerfen sie je nach Tarif und Einstellung nur
  ueber die Oberflaeche eingeschaltet werden. Ein `create extension`, das dort
  scheitert, risse die GANZE Migration mit — und mit ihr alles, was danach
  kommt. Lieber eine Meldung im Protokoll und ein Zeitplan, der nicht
  eingerichtet ist, als ein Einspielen, das auf halbem Weg abbricht.

  Ist es soweit: Dashboard > Database > Extensions, `pg_cron` und `pg_net`
  einschalten, danach diese Migration erneut einspielen.
*/
do $$
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
exception when others then
  raise warning 'pg_cron/pg_net nicht verfügbar (%). Der nächtliche Lauf ist NICHT eingerichtet; im Dashboard unter Database > Extensions einschalten.', sqlerrm;
end;
$$;

/*
  WO DIE ADRESSE UND DAS GEHEIMNIS STEHEN: im Tresor, nicht in dieser Datei.

  Eine Migration liegt im Git. Ein Dienstschluessel darin waere dort fuer
  immer — auch nach dem Loeschen, auch nach dem Wechseln, weil die Historie
  bleibt. Der Tresor (`vault`) verschluesselt beides in der Datenbank; gelesen
  wird es nur von dieser Funktion, und die laeuft als Eigentuemer.

  Angelegt werden sie EINMAL, von Hand oder aus der Auslieferung:

    select vault.create_secret('https://<ref>.supabase.co/functions/v1/daten-ausleitung',
                               'ausleitung_url');
    select vault.create_secret('<service_role_key>', 'ausleitung_schluessel');

  Fehlen sie, tut der Lauf NICHTS und sagt es — statt jede Nacht in einen
  Fehler zu laufen, den niemand liest.
*/
create or replace function app.ausleitung_anstossen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text;
  schluessel text;
begin
  select decrypted_secret into adresse
    from vault.decrypted_secrets where name = 'ausleitung_url';
  select decrypted_secret into schluessel
    from vault.decrypted_secrets where name = 'ausleitung_schluessel';

  if adresse is null or schluessel is null then
    raise warning 'Ausleitung nicht eingerichtet: ausleitung_url oder ausleitung_schluessel fehlt im Tresor.';
    return;
  end if;

  perform net.http_post(
    url := adresse,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || schluessel),
    body := jsonb_build_object('quelle', 'nachtlauf'),
    -- Ein grosser Betrieb liest seinen ganzen Bestand. Die Vorgabe von fuenf
    -- Sekunden reicht dafuer nicht; `net.http_post` wartet ohnehin nicht auf
    -- die Antwort, aber die Verbindung darf nicht vorher fallen.
    timeout_milliseconds := 300000);
end;
$$;

/*
  02:30 WIENER ZEIT — UND `pg_cron` RECHNET IN UTC.

  Eingetragen ist 01:30 UTC. Das ist im Sommer 03:30 und im Winter 02:30
  Wiener Zeit; der Lauf wandert also mit der Zeitumstellung um eine Stunde.
  Fuer einen Nachtlauf ist das ohne Belang, und die Alternative — zwei
  Eintraege, die sich halbjaehrlich abwechseln — waere mehr Mechanik, als die
  Sache wert ist. Es steht hier, damit niemand es spaeter im Protokoll
  entdeckt und fuer einen Fehler haelt.

  Vor dem Bilanzlauf gibt es nichts mehr zu ordnen: die Monatsbilanzen sind
  eine Sicht geworden, der zweite Nachtlauf ist ersatzlos entfallen.
*/
do $$
begin
  perform cron.unschedule('ausleitung');
exception when others then
  -- Beim ersten Einspielen gibt es ihn noch nicht.
  null;
end;
$$;

do $$
begin
  perform cron.schedule('ausleitung', '30 1 * * *', 'select app.ausleitung_anstossen()');
exception when others then
  raise warning 'Zeitplan nicht eingerichtet (%).', sqlerrm;
end;
$$;
