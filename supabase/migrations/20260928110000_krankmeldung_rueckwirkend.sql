/*
  EINE EIGENE KRANKMELDUNG REICHT HÖCHSTENS 14 TAGE ZURÜCK (offene Punkte A4,
  Prüflauf P1-28).

  Bisher liess `krankmeldung_speichern` jeden Beginn zu, bis 480 Arbeitstage
  zurück. Ein Mitarbeiter konnte sich so rückwirkend für Monate krank melden
  — und damit Tage, an denen er nicht gebucht hatte, als Solltage ins
  Zeitkonto schreiben, ohne dass es jemand sah.

  14 TAGE, weil das den Alltag deckt: krank vom Montag bis Freitag, am
  nächsten Montag zurück und erst dann gemeldet. Was weiter zurückliegt, ist
  kein Vergessen mehr, sondern eine Klärung — die trägt das Büro ein
  (Buchhaltung, Geschäftsführung, Administration, wie für fremde Meldungen).

  NUR DER BEGINN ZÄHLT, UND NUR WENN ER NACH VORNE RÜCKT. Wer seit drei
  Wochen krank ist, verlängert seine Meldung weiter selbst — ihr Beginn
  liegt dann längst über der Grenze, bewegt sich aber nicht.

  Als Auslöser an der Tabelle, nicht in der Funktion: so gilt die Grenze für
  jeden Schreibweg, und die Funktion bleibt, wie sie ist. Ohne Anmeldung
  (Dienstzugang, Rücklauf) gibt es keinen „Mitarbeiter", dann gilt sie nicht.
*/
create or replace function app.krank_rueckwirkend_pruefen() returns trigger
  language plpgsql
  set search_path = ''
as $$
declare
  grenze date := (now() at time zone 'Europe/Vienna')::date - 14;
begin
  if auth.uid() is null or app.ist_buch_oder_spitze() then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.von >= old.von then
    return new;
  end if;
  if new.von < grenze then
    -- Die Meldung erreicht den Monteur wörtlich (`grundAus`): sie sagt, bis
    -- wohin er selbst melden kann, und wer den Rest einträgt.
    raise exception 'Selbst melden geht bis 14 Tage zurück (ab %). Was davor liegt, trägt das Büro ein.',
      to_char(grenze, 'DD.MM.YYYY')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function app.krank_rueckwirkend_pruefen() from public, anon, authenticated;

create trigger krankmeldungen_rueckwirkend
  before insert or update of von on public.krankmeldungen
  for each row execute function app.krank_rueckwirkend_pruefen();
