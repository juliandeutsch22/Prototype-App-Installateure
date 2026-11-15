-- K3 (Durchsicht 15.11.2026): der Nachtlauf der Sicherung stößt je Betrieb an.

/*
  WAS VORHER GESCHAH. Um 01:30 ging EIN Anstoß an `daten-ausleitung`, und die
  Function arbeitete in einer Schleife alle Betriebe ab — der ganze Stand je
  Betrieb, dazu bis zu 200 Dateien. Die Wanduhr einer Edge Function gilt aber
  für den ganzen Aufruf. Mit wachsender Zahl der Betriebe lief er in seine
  Zeitgrenze: die Betriebe am Ende der (immer gleichen) Reihenfolge wurden
  NIE gesichert, und weil keine Antwort kam, meldete die Wache bei JEDEM
  Betrieb „Keine Antwort“ — auch bei denen, deren Stand längst lag.

  JETZT: EINE WARTESCHLANGE, EIN ANSTOSS JE BETRIEB.

    01:30  `ausleitung_anstossen` reiht jeden Betrieb ein, der nicht ruht,
           und stößt die ersten an.
    minütlich  `ausleitung_weiter` sieht nach, was aus den Anstößen wurde
           (je Betrieb), und stößt nach, solange Plätze frei sind.

  Jeder Aufruf der Function sichert genau einen Betrieb und hat seine eigene
  Wanduhr. Der Merkzettel trägt den Betrieb, also meldet die Wache einen
  Fehlschlag genau dort, wo er geschah.

  GLEICHZEITIG HÖCHSTENS SECHS. Jeder Lauf legt eine Arbeitskopie des ganzen
  Betriebs an und liest sie seitenweise; alle Betriebe zugleich anzustoßen,
  hieße nachts die Datenbank mit allen Kopien auf einmal zu belasten. Sechs
  Plätze, je Minute nachgefüllt: auch ein Betrieb, der lange braucht, hält
  die übrigen nicht auf, und mit rund zehn Sekunden je Betrieb sind
  dreihundert und mehr Betriebe in der ersten Stunde durch.

  WARUM NICHT DIE FUNCTION SELBST WEITERREICHT (Zeitbudget mit Fortsetzung).
  Bricht ein solcher Lauf mitten in einem Betrieb ab, weiß niemand, welcher
  es war — genau die Frage, an der die Wache bisher scheiterte. Mit einem
  Anstoß je Betrieb steht die Antwort auf dem Merkzettel.
*/

alter table app.anstoss_wache add column if not exists betrieb text;

create table if not exists app.ausleitung_warteschlange (
  betrieb    text primary key references public.companies(id) on delete cascade,
  eingereiht timestamptz not null default now()
);
revoke all on app.ausleitung_warteschlange from public, anon, authenticated, service_role;

create or replace function app.ausleitung_gleichzeitig() returns integer
  language sql immutable
  security definer
  set search_path = ''
as $$ select 6 $$;
revoke all on function app.ausleitung_gleichzeitig() from public, anon, authenticated;

/*
  DIE WACHE, JE BETRIEB. Bis auf den Empfänger der Meldung derselbe Rumpf wie
  in 20261013120000_anstoss_neustart.sql. Ein Merkzettel OHNE Betrieb stammt
  aus der Zeit vor dieser Migration (ein Anstoß für alle) und wird wie
  damals für jeden Betrieb gemeldet.

  Ein Betrieb, den es inzwischen nicht mehr gibt, bekommt keine Zeile —
  sonst bräche der Fremdschlüssel von `system_laeufe` die ganze Wache ab,
  und mit ihr die Meldungen aller übrigen Betriebe.
*/
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
    select * into antwort from net._http_response r where r.id = zettel.anfrage
      and zettel.generation = app.anstoss_generation();

    if antwort.id is null then
      /*
        Noch keine Antwort. Kurz nach dem Anstoß ist das der Normalfall — die
        Function liest ja gerade. Der Aufruf selbst gibt nach sieben Minuten
        auf (dann steht eine Antwort mit Fehler da); ohne jede Antwort nach
        einer Stunde ist etwas Grundsätzliches passiert.
      */
      if zettel.generation = app.anstoss_generation()
         and zettel.angestossen > now() - interval '1 hour' then
        continue;
      end if;
      meldung := 'Keine Antwort auf den Anstoss der Ausleitung.';

    elsif antwort.status_code = 200 then
      -- Bei einer 200 hat die Function selbst festgehalten, wie es ausging.
      delete from app.anstoss_wache where anfrage = zettel.anfrage and generation = zettel.generation;
      continue;

    else
      meldung := format(
        'Die Ausleitung antwortete mit %s: %s',
        coalesce(antwort.status_code::text, 'einem Fehler'),
        left(coalesce(nullif(antwort.error_msg, ''), antwort.content, ''), 300));
    end if;

    if zettel.betrieb is null then
      perform public.lauf_festhalten(c.id, 'ausleitung', false, meldung)
        from public.companies c;
    elsif exists (select 1 from public.companies c where c.id = zettel.betrieb) then
      perform public.lauf_festhalten(zettel.betrieb, 'ausleitung', false, meldung);
    end if;

    delete from app.anstoss_wache where anfrage = zettel.anfrage and generation = zettel.generation;
  end loop;

  delete from app.anstoss_wache where angestossen < now() - interval '7 days';
end;
$$;

revoke all on function app.ausleitung_nachsehen() from public, anon, authenticated;

/*
  NACHSEHEN, DANN NACHFÜLLEN. Erst werden die beantworteten Anstöße
  beurteilt — dabei werden Plätze frei —, dann gehen so viele Betriebe
  hinaus, wie Plätze frei sind. Offen ist ein Platz, solange sein Merkzettel
  liegt; ein Merkzettel aus der Zeit vor einem Neustart (`generation`) zählt
  nicht mehr, ihn beurteilt die Wache sofort.

  Ein Betrieb, der inzwischen ruht, wird aus der Schlange genommen, ohne
  angestoßen zu werden — wie bisher: kein neuer Stand, der letzte bleibt.
*/
create or replace function app.ausleitung_weiter() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  adresse text;
  schluessel text;
  frei integer;
  naechster text;
  anfrage bigint;
begin
  perform app.ausleitung_nachsehen();

  if not exists (select 1 from app.ausleitung_warteschlange) then
    return;
  end if;

  select decrypted_secret into adresse
    from vault.decrypted_secrets where name = 'ausleitung_url';
  select decrypted_secret into schluessel
    from vault.decrypted_secrets where name = 'ausleitung_schluessel';
  if adresse is null or schluessel is null then
    raise warning 'Ausleitung nicht eingerichtet: ausleitung_url oder ausleitung_schluessel fehlt im Tresor.';
    return;
  end if;

  frei := app.ausleitung_gleichzeitig() - (
    select count(*) from app.anstoss_wache w
     where w.art = 'ausleitung' and w.generation = app.anstoss_generation());

  while frei > 0 loop
    delete from app.ausleitung_warteschlange q
     where q.betrieb = (
       select s.betrieb from app.ausleitung_warteschlange s
        order by s.eingereiht, s.betrieb
        limit 1
        for update skip locked)
    returning q.betrieb into naechster;
    exit when naechster is null;

    continue when app.betrieb_ruht(naechster);

    select net.http_post(
      url := adresse,
      headers := app.anstoss_kopfzeilen(schluessel),
      body := jsonb_build_object('quelle', 'nachtlauf', 'betrieb', naechster),
      /*
        Länger als die Wanduhr der Function (400 s). Gäbe `pg_net` vorher
        auf, stünde ein Fehlschlag in der Überwachung, während die Function
        noch fertig schreibt — und je nach Reihenfolge überschriebe der eine
        den anderen.
      */
      timeout_milliseconds := 420000)
    into anfrage;

    insert into app.anstoss_wache (anfrage, art, betrieb) values (anfrage, 'ausleitung', naechster);
    frei := frei - 1;
    naechster := null;
  end loop;
end;
$$;

revoke all on function app.ausleitung_weiter() from public, anon, authenticated;

/*
  DER ANSTOSS UM 01:30: einreihen, dann die ersten Plätze füllen. Wer noch
  von gestern in der Schlange steht (die Nacht war zu kurz), bleibt mit
  seinem alten Platz vorn — sonst käme ein Betrieb am Ende der Liste nie dran.
  Ohne Tresoreintrag wird nichts eingereiht: eine Schlange, die niemand
  abarbeiten kann, wüchse nur.
*/
create or replace function app.ausleitung_anstossen() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'ausleitung_url')
     or not exists (select 1 from vault.decrypted_secrets where name = 'ausleitung_schluessel') then
    raise warning 'Ausleitung nicht eingerichtet: ausleitung_url oder ausleitung_schluessel fehlt im Tresor.';
    return;
  end if;

  insert into app.ausleitung_warteschlange (betrieb)
  select c.id from public.companies c
   where not app.betrieb_ruht(c.id)
  on conflict (betrieb) do nothing;

  perform app.ausleitung_weiter();
end;
$$;

revoke all on function app.ausleitung_anstossen() from public, anon, authenticated;

/*
  DIE WACHE LÄUFT JETZT MINÜTLICH statt einmal um 01:45. Ist die Schlange
  leer und kein Anstoß offen, tut sie nichts als zwei kurze Abfragen.
*/
do $$
begin
  perform cron.unschedule('ausleitung-wache');
exception when others then
  null;
end;
$$;

do $$
begin
  perform cron.schedule('ausleitung-wache', '* * * * *', 'select app.ausleitung_weiter()');
exception when others then
  raise warning 'Die Wache der Ausleitung konnte nicht eingeplant werden: %', sqlerrm;
end;
$$;
