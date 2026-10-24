/*
  WER GEMAHNT HAT (A2 der Durchsicht vom 24.10.2026)

  WAS FEHLTE. Eine Mahnung hielt Stufe, Tag, Frist, Spesen und das Schreiben
  fest, aber nicht, wer sie ausgestellt hat (Grenze seit 15.9., beim
  Einzelspeichern am 10.10. ausdrücklich so belassen). Fragt der Kunde nach
  oder klärt das Büro einen Streit über eine Mahnung, ist die erste Frage
  „wer hat das hinausgeschickt?“ — der Verlauf der Rechnung gab darauf keine
  Antwort.

  WIE. Wie bei Zahlungseingängen und Lagerbewegungen: Kennung und Name der
  Person, die mahnt. Der Name steht als Wortlaut dabei, damit der Verlauf
  ihn auch dann noch zeigt, wenn die Person später umbenannt wird oder den
  Betrieb verlassen hat.

  NUR DIE DATENBANK SETZT SIE, aus der Anmeldung (`auth.uid()`), nicht aus
  einem Wert der App. Sonst könnte eine Mahnung im Namen einer anderen
  Person entstehen. Der Rücklauf einer Sicherung (Dienstschlüssel) bringt
  die Werte mit und behält sie.

  ALTBESTAND. Mahnungen von vor dieser Migration bleiben ohne Person — wer
  damals gemahnt hat, weiß die Datenbank nicht, und erfunden wird nichts.

  DATENSCHUTZ. Die Tabelle hat damit einen Bezug zu einer Person im Betrieb:
  die Datenauskunft der Person zählt ihre Mahnungen unter „als Bearbeiter“
  (wie die erfassten Zahlungen) — der Inhalt gehört dem Kunden. Bei der Löschung einer Person bleibt der Name stehen, solange die
  Rechnung aufbewahrt wird (§ 132 BAO); die Mahnung ist Teil von ihr.
*/

alter table public.mahnungen add column if not exists gemahnt_von uuid;
alter table public.mahnungen add column if not exists gemahnt_von_name text;

/*
  SECURITY DEFINER, damit der Name nicht vom Zeilenschutz der Belegschaft
  abhängt — gelesen wird genau eine Zeile, die der Anmeldung.
*/
create or replace function app.mahnung_wer() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if app.ist_dienst() then
    return new;
  end if;
  new.gemahnt_von := (select auth.uid());
  new.gemahnt_von_name := (select u.name from public.users u where u.id = (select auth.uid()));
  return new;
end;
$$;

revoke all on function app.mahnung_wer() from public, anon, authenticated;

drop trigger if exists mahnungen_wer on public.mahnungen;
create trigger mahnungen_wer
  before insert on public.mahnungen
  for each row execute function app.mahnung_wer();

/*
  DIE DATENAUSKUNFT EINER PERSON zählt ihre Mahnungen unter „als Bearbeiter“.
  Gezielt eingefügt wie in `20261013140000_auszug_arbeitskopien.sql`: die
  Funktion ist seither nicht mehr als Ganzes in einer Datei nachzulesen, ein
  Abschrieb der letzten Datei nähme die Arbeitskopien wieder heraus.
  Wiederholbar; fehlt die Einfügestelle, bricht die Migration ab statt still
  nichts zu tun.
*/
do $migration$
declare quelle text; marke text;
begin
  quelle := pg_get_functiondef('public.person_auskunft(text,uuid,integer)'::regprocedure);
  if position('mahnungen_ausgestellt' in quelle) = 0 then
    marke := $m$        where z.company_id = betrieb and z.erfasst_von = p_id),$m$;
    if position(marke in quelle) = 0 then raise exception 'Personenauskunft: Einfügestelle fehlt'; end if;
    execute replace(quelle, marke, marke || $eintrag$
      'mahnungen_ausgestellt', (select count(*) from public.mahnungen m
        where m.company_id = betrieb and m.gemahnt_von = p_id),$eintrag$);
  end if;
end;
$migration$;
