-- Wie pg_net verliert diese Kennung nur bei Crash-Recovery ihren Inhalt.
-- Ein ordentliches Stoppen/Starten erhält sie: vorhandene Antworten bleiben gültig.
create unlogged table if not exists app.anstoss_generation (
  einzig boolean primary key default true check(einzig),
  kennung uuid not null default gen_random_uuid()
);
revoke all on app.anstoss_generation from public, anon, authenticated, service_role;
create or replace function app.anstoss_generation() returns uuid
language plpgsql security definer set search_path = '' as $$
declare k uuid;
begin
  select kennung into k from app.anstoss_generation where einzig;
  if k is not null then return k; end if;
  insert into app.anstoss_generation(einzig) values(true)
    on conflict (einzig) do update set einzig = excluded.einzig returning kennung into k;
  return k;
end; $$;
revoke all on function app.anstoss_generation() from public, anon, authenticated;

alter table app.anstoss_wache add column if not exists generation uuid not null default app.anstoss_generation();
alter table app.anstoss_wache drop constraint anstoss_wache_pkey;
alter table app.anstoss_wache add primary key (generation, anfrage);

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
    select * into antwort from net._http_response r where r.id = zettel.anfrage
      and zettel.generation = app.anstoss_generation();

    if antwort.id is null then
      /*
        Noch keine Antwort. Der Aufruf gibt nach zwanzig Sekunden auf; wer
        nach einer Stunde noch nichts gesagt hat, sagt nichts mehr. Vorher
        bleibt der Zettel liegen und wird beim nächsten Lauf erneut angesehen.
      */
      if zettel.generation = app.anstoss_generation()
         and zettel.angestossen > now() - interval '1 hour' then
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

    delete from app.anstoss_wache where anfrage = zettel.anfrage and generation = zettel.generation;
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
        Noch keine Antwort. Kurz nach dem Anstoss ist das der Normalfall —
        die Function liest ja gerade. Nach einer Stunde ist es keiner mehr:
        die Zeitgrenze des Aufrufs liegt bei fünf Minuten.

        `pg_net` räumt alte Antworten nach einigen Stunden weg. Der Wächter
        läuft eine Viertelstunde nach dem Anstoss und kommt ihm damit zuvor.
      */
      if zettel.generation = app.anstoss_generation()
         and zettel.angestossen > now() - interval '1 hour' then
        continue;
      end if;
      meldung := 'Keine Antwort auf den Anstoss der Ausleitung.';

    elsif antwort.status_code = 200 then
      delete from app.anstoss_wache where anfrage = zettel.anfrage and generation = zettel.generation;
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

    delete from app.anstoss_wache where anfrage = zettel.anfrage and generation = zettel.generation;
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

