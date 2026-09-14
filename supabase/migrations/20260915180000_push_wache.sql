/*
  DIE ÜBERWACHUNG DER PUSH-MELDUNGEN.

  WAS BISHER FEHLTE. `app.push_anstossen` wirft die Nummer seiner Anfrage weg:
  `perform net.http_post(...)`. Damit ist der Anstoss getan, sobald er in der
  Warteschlange liegt — was danach zurückkommt, landet in
  `net._http_response`, und dort sieht niemand hin.

  DER FALL, DER WEHTUT, ist nicht die einzelne verlorene Meldung. Es ist der
  systematische Ausfall: ein Schlüssel stimmt nicht mehr, die Adresse zeigt
  ins Leere, die Function ist nicht ausgeliefert. Dann geht KEINE Meldung mehr
  hinaus — und niemand merkt es, denn eine Push-Meldung, die nicht kommt,
  sieht aus wie eine, die es nicht zu senden gab.

  WARUM PUSH NICHT IN `beurteile` PASST, und das ist der Grund, warum diese
  Überwachung eine eigene ist statt eine Zeile mehr in der bestehenden:

    Die Nachtläufe MÜSSEN laufen. Bleiben sie aus, ist das der Fehler, und
    `beurteile` meldet nach fünfzig Stunden „überfällig".

    Push läuft, WENN etwas passiert. Bestellt drei Tage niemand Material,
    geht zu Recht keine Meldung hinaus. Dieselbe Frist darübergelegt, ergäbe
    das einen Fehlalarm am ruhigen Wochenende — und eine Warnung, die
    grundlos erscheint, wird nach zwei Wochen nicht mehr gelesen. Auch dann
    nicht, wenn sie einmal recht hat.

  GEMESSEN WIRD DESHALB EIN ANTEIL, KEINE FRIST: von den Meldungen, die
  angestossen WURDEN, wie viele sind nicht durchgekommen.
*/

-- ---------------------------------------------------------------------------
-- 1. Die Nummer der Anfrage behalten
-- ---------------------------------------------------------------------------

/*
  DER MERKZETTEL LIEGT IM HEISSEN PFAD, und das ist bedacht: diese Funktion
  läuft in der Transaktion des Monteurs, der gerade Material anfordert. Eine
  Zeile in eine schmale Tabelle kostet nichts messbar, und der Ausnahmeblock
  unten fängt ohnehin alles ab — eine Materialanforderung darf niemals daran
  scheitern, dass die Überwachung klemmt.
*/
create or replace function app.push_anstossen(p_ereignis jsonb) returns void
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
    from vault.decrypted_secrets where name = 'push_url';
  select decrypted_secret into schluessel
    from vault.decrypted_secrets where name = 'push_schluessel';

  if adresse is null or schluessel is null then
    raise warning 'Push nicht eingerichtet: push_url oder push_schluessel fehlt im Tresor.';
    return;
  end if;

  select net.http_post(
    url := adresse,
    headers := app.anstoss_kopfzeilen(schluessel),
    body := p_ereignis,
    timeout_milliseconds := 20000)
  into anfrage;

  insert into app.anstoss_wache (anfrage, art) values (anfrage, 'push');
exception when others then
  -- Eine Push-Meldung, die nicht hinausgeht, ist aergerlich. Eine
  -- Materialanforderung, die deshalb nicht angelegt wird, ist ein
  -- Betriebsstillstand. Der Anstoss reisst den Schreibvorgang nicht mit.
  raise warning 'Push konnte nicht angestossen werden: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Der Zustand bekommt einen Platz
-- ---------------------------------------------------------------------------

/*
  `system_laeufe` trägt schon die beiden Nachtläufe; die Prüfbedingung liess
  bisher nur sie zu. Push kommt dazu, WEIL DIE ÜBERSICHT DIESELBE IST — die
  Geschäftsführung sieht an einer Stelle nach, nicht an dreien. Beurteilt wird
  es trotzdem nach eigener Regel (siehe `shared/laufStatus.ts`).
*/
alter table public.system_laeufe drop constraint if exists system_laeufe_art_check;
alter table public.system_laeufe add constraint system_laeufe_art_check
  check (art in ('ausleitung', 'bilanzen', 'push'));

-- ---------------------------------------------------------------------------
-- 3. Nachsehen, was aus den Anstössen geworden ist
-- ---------------------------------------------------------------------------

create or replace function app.push_nachsehen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  zettel record;
  antwort record;
  versuche integer := 0;
  fehlschlaege integer := 0;
  letzter_fehler text;
begin
  for zettel in
    select * from app.anstoss_wache where art = 'push' order by anfrage
  loop
    select * into antwort from net._http_response r where r.id = zettel.anfrage;

    if antwort.id is null then
      /*
        Noch keine Antwort. Der Aufruf gibt nach zwanzig Sekunden auf; wer
        nach einer Stunde noch nichts gesagt hat, sagt nichts mehr. Vorher
        bleibt der Zettel liegen und wird beim nächsten Lauf erneut angesehen.
      */
      if zettel.angestossen > now() - interval '1 hour' then
        continue;
      end if;
      versuche := versuche + 1;
      fehlschlaege := fehlschlaege + 1;
      letzter_fehler := 'Keine Antwort auf den Anstoss.';

    elsif antwort.status_code = 200 then
      versuche := versuche + 1;

    else
      versuche := versuche + 1;
      fehlschlaege := fehlschlaege + 1;
      -- 300 Zeichen: die Meldung steht in einer Übersichtskarte, und eine
      -- seitenlange Fehlerseite macht sie unlesbar, ohne mehr zu sagen.
      letzter_fehler := format(
        'Der Versand antwortete mit %s: %s',
        coalesce(antwort.status_code::text, 'einem Fehler'),
        left(coalesce(nullif(antwort.error_msg, ''), antwort.content, ''), 300));
    end if;

    delete from app.anstoss_wache where anfrage = zettel.anfrage;
  end loop;

  /*
    OHNE VERSUCHE WIRD NICHTS GESCHRIEBEN.

    Ein ruhiger Tag ist kein Befund. Stünde hier trotzdem ein Eintrag, hiesse
    „null Meldungen, null Fehlschläge" in der Übersicht dasselbe wie „es
    funktioniert" — und das wäre eine Behauptung über etwas, das gar nicht
    geprüft wurde. Der letzte echte Stand bleibt stehen.
  */
  if versuche = 0 then
    return;
  end if;

  /*
    FÜR JEDEN BETRIEB, wie beim Nachtlauf-Wächter. Scheitert der Versand, dann
    aus einem Grund, der alle trifft: ein Schlüssel, eine Adresse, eine nicht
    ausgelieferte Function. Die Nummer der Anfrage sagt nicht, zu welchem
    Betrieb sie gehörte — und sie müsste es auch nicht, denn die Antwort
    lautet für alle gleich.
  */
  perform public.lauf_festhalten(
    c.id,
    'push',
    fehlschlaege = 0,
    case when fehlschlaege = 0 then null else letzter_fehler end,
    fehlschlaege,
    'nicht zugestellt')
    from public.companies c;
end;
$$;

revoke all on function app.push_nachsehen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Stündlich, nicht nächtlich
-- ---------------------------------------------------------------------------

/*
  Ein Ausfall des Versands soll am selben Tag auffallen, nicht am nächsten
  Morgen. Stündlich ist oft genug dafür und selten genug, dass der Lauf
  nichts kostet: er liest eine Handvoll Zeilen.
*/
do $$
begin
  perform cron.unschedule('push-wache');
exception when others then
  null;
end;
$$;

do $$
begin
  perform cron.schedule('push-wache', '20 * * * *', 'select app.push_nachsehen()');
exception when others then
  raise warning 'Die Push-Wache konnte nicht eingeplant werden: %', sqlerrm;
end;
$$;
