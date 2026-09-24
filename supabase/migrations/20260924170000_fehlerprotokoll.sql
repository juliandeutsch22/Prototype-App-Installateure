-- DAS FEHLERPROTOKOLL — Fehler sehen, bevor jemand anruft.
--
-- Bisher landete ein Absturz nur in der Konsole des Geräts. Das war
-- Absicht: kein fremder Dienst, keine Daten ausser Haus. Der Preis war, dass
-- man nur erfuhr, was jemand meldete — und auf der Baustelle meldet niemand
-- eine weisse Seite, er ruft irgendwann an oder hört auf, die App zu
-- benutzen.
--
-- JETZT GEHT DER FEHLER IN DIE EIGENE DATENBANK, nicht zu einem Dienst wie
-- Sentry. Was hineinkommt, ist TECHNIK: Fehlermeldung, Stapel, Ansicht (ohne
-- Kennungen), Fassung, Gerät. Keine Formularinhalte, keine Namen von
-- Kunden. Der Browser putzt die Meldung, bevor sie abgeht
-- (`src/lib/fehlerprotokoll.ts`).
--
-- DAZU DIE MELDUNG VON HAND: „Problem melden" schreibt eine Beschreibung in
-- dieselbe Tabelle. Sie ist das Einzige hier, was ein Mensch frei tippt.

create table if not exists public.fehlerprotokoll (
  id           uuid primary key default gen_random_uuid(),
  -- Aus dem Token, nicht vom Browser: ein Melder, der den Betrieb selbst
  -- angeben müsste, könnte ihn auch falsch angeben.
  company_id   text not null default app.betrieb() references public.companies (id),
  -- Ohne Fremdschlüssel: ein Protokolleintrag soll nichts festhalten, und
  -- der Rücklauf spielt ihn ein, ohne auf die Reihenfolge zu achten.
  user_id      uuid default auth.uid(),
  art          text not null check (art in ('absturz', 'fehler', 'meldung')),
  nachricht    text check (char_length(nachricht) <= 500),
  stapel       text check (char_length(stapel) <= 4000),
  pfad         text check (char_length(pfad) <= 200),
  fassung      text check (char_length(fassung) <= 40),
  geraet       text check (char_length(geraet) <= 300),
  beschreibung text check (char_length(beschreibung) <= 2000),
  /*
    NUR BEI EINER MELDUNG, UND NUR MIT HÄKCHEN. Die Beschreibung ist freier
    Text und kann alles enthalten. Die Plattform sieht in keinen Betrieb
    hinein — diese Zusage gilt weiter, und ein Mensch hebt sie für genau
    eine Meldung auf, indem er sie ausdrücklich auch an den Support schickt.
  */
  an_support   boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint fehlerprotokoll_meldung_hat_text check (
    (art = 'meldung') = (beschreibung is not null and btrim(beschreibung) <> '')),
  constraint fehlerprotokoll_fehler_hat_nachricht check (
    art = 'meldung' or (nachricht is not null and btrim(nachricht) <> '')),
  constraint fehlerprotokoll_support_nur_meldung check (art = 'meldung' or not an_support)
);

comment on table public.fehlerprotokoll is
  'Abstürze und Fehlermeldungen aus der App, ohne Inhaltsdaten, und von Hand gemeldete Probleme. Nach 90 Tagen gelöscht.';

create index if not exists fehlerprotokoll_betrieb
  on public.fehlerprotokoll (company_id, created_at desc);
-- Für die Drossel: wie viel hat DIESES Konto in der letzten Stunde geschrieben.
create index if not exists fehlerprotokoll_drossel
  on public.fehlerprotokoll (user_id, created_at);

alter table public.fehlerprotokoll enable row level security;

/*
  SCHREIBEN DARF JEDER IM BETRIEB — der Monteur stürzt genauso ab wie die
  Geschäftsführung. LESEN nur Geschäftsführung und Administration: in den
  Meldungen steht, wer wann wo hängengeblieben ist, und das ist kein
  Arbeitsmittel der Projektleitung.

  KEIN ÄNDERN, KEIN LÖSCHEN. Ein Protokoll, in dem man aufräumen kann, sagt
  nichts mehr darüber, was passiert ist. Gelöscht wird nach 90 Tagen, von
  der Datenbank selbst.
*/
drop policy if exists fehlerprotokoll_schreiben on public.fehlerprotokoll;
create policy fehlerprotokoll_schreiben on public.fehlerprotokoll for insert
  with check (app.betriebsmitglied(company_id));

drop policy if exists fehlerprotokoll_lesen on public.fehlerprotokoll;
create policy fehlerprotokoll_lesen on public.fehlerprotokoll for select
  using (app.darf(company_id) and app.hat_rolle(array['Geschäftsführung', 'Administrator']));

grant select, insert on public.fehlerprotokoll to authenticated;

drop trigger if exists fehlerprotokoll_kein_support_schreiben on public.fehlerprotokoll;
create trigger fehlerprotokoll_kein_support_schreiben before insert or update or delete on public.fehlerprotokoll
  for each row execute function app.support_schreibt_nicht();

/*
  WER UND WANN SETZT DIE DATENBANK, nicht der Browser — sonst liesse sich
  ein Eintrag einem Kollegen unterschieben oder in die Vergangenheit legen.
  Ausgenommen ist der Rücklauf aus der Sicherung: er spielt fremde Einträge
  mit ihrem echten Zeitpunkt wieder ein.

  DIE DROSSEL. Eine Ansicht, die bei jedem Zeichnen abstürzt, schriebe in
  einer Schleife. Der Browser bremst selbst; diese Grenze gilt auch, wenn er
  es nicht tut. Was darüber liegt, wird still verworfen — ein Fehler beim
  Melden eines Fehlers hilft niemandem.
*/
create or replace function app.fehlerprotokoll_eingang() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  new.user_id := auth.uid();
  new.created_at := now();
  if (select count(*) from public.fehlerprotokoll f
       where f.user_id = new.user_id
         and f.created_at > now() - interval '1 hour') >= 30 then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists fehlerprotokoll_eingang on public.fehlerprotokoll;
create trigger fehlerprotokoll_eingang before insert on public.fehlerprotokoll
  for each row execute function app.fehlerprotokoll_eingang();

-- ---------------------------------------------------------------------------
-- Was die Plattform sieht
-- ---------------------------------------------------------------------------

/*
  DIE PLATTFORM SIEHT DIE TECHNIK, NICHT DEN BETRIEB.

  Der Zeilenschutz lässt ein Plattformkonto an keine Betriebstabelle, und
  ein Schema-Wächter hält das fest. Diese Funktion ist die eine, eng
  geschnittene Ausnahme, gebaut wie `support_freigaben_offen`: technische
  Fehler aus allen Betrieben, damit der Betreiber einen Absturz nach einem
  Deploy sieht, bevor jemand anruft.

  NICHT dabei: wer es war (keine Kennung), und eine Meldung nur, wenn ihr
  Verfasser das Häkchen „auch an den Support" gesetzt hat. Ohne Häkchen
  erfährt die Plattform nicht einmal, DASS es sie gibt.
*/
create or replace function public.fehlerprotokoll_plattform(p_tage integer default 14)
  returns table (
    id uuid, company_id text, betrieb text, art text, nachricht text, stapel text,
    pfad text, fassung text, geraet text, beschreibung text, created_at timestamptz)
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select f.id, f.company_id, c.name, f.art, f.nachricht, f.stapel,
         f.pfad, f.fassung, f.geraet, f.beschreibung, f.created_at
    from public.fehlerprotokoll f
    join public.companies c on c.id = f.company_id
   where app.ist_plattform()
     and (f.art <> 'meldung' or f.an_support)
     and f.created_at > now() - make_interval(days => least(greatest(coalesce(p_tage, 14), 1), 90))
   order by f.created_at desc
   limit 500
$$;

revoke all on function public.fehlerprotokoll_plattform(integer) from public, anon;
grant execute on function public.fehlerprotokoll_plattform(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Nach 90 Tagen weg
-- ---------------------------------------------------------------------------

/*
  WARUM 90 TAGE. Ein Fehler, der ein Vierteljahr nicht wieder aufgetreten
  ist, ist behoben oder bedeutungslos. Länger aufzuheben hiesse, ein
  Bewegungsprotokoll der Mitarbeiter zu führen („wer war wann in welcher
  Ansicht") — ohne Zweck, und ein Zweck ist nach der DSGVO die Bedingung.
*/
create or replace function app.fehlerprotokoll_aufraeumen() returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.fehlerprotokoll where created_at < now() - interval '90 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function app.fehlerprotokoll_aufraeumen() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('fehlerprotokoll-aufraeumen');
exception when others then
  -- Beim ersten Einspielen gibt es ihn noch nicht.
  null;
end;
$$;

do $$
begin
  perform cron.schedule('fehlerprotokoll-aufraeumen', '10 3 * * *', 'select app.fehlerprotokoll_aufraeumen()');
exception when others then
  raise warning 'Das Aufräumen des Fehlerprotokolls konnte nicht eingeplant werden: %', sqlerrm;
end;
$$;
