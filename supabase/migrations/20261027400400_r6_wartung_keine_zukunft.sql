/*
  WARTUNG: KEIN TAG UND KEIN BAUJAHR AUS DER ZUKUNFT (Testbericht Runde 6, G23)

  WAS DER BERICHT FAND. „Zuletzt gewartet 01.12.2026“ (am 27.10.) wurde
  gespeichert, die Liste zeigte „zuletzt 01.12.2026 · Termin 01.12.2027“ und
  hielt eine Ausführung fest, die es nicht gab. „Bj. 2030“ ging ebenso durch;
  die Erledigt-Maske begrenzte das Datum nicht.

  WAS JETZT GILT. Die App weist beides ab (`wartungsTagFehler`,
  `baujahrFehler`), und die Datenbank zieht dieselbe Grenze — für jeden Weg,
  auf dem `zuletzt_am` sich ändert: Formular, „Erledigt“, „Tag berichtigen“.
  „Heute“ ist der Wiener Tag.

  NUR WAS SICH ÄNDERT, wird geprüft. Eine Wartung, die schon einen Tag aus
  der Zukunft trägt (Altbestand, etwa aus dem Testbericht), lässt sich
  weiter bearbeiten; erst wer den Tag oder das Baujahr anfasst, muss einen
  gültigen eintragen. Kein Datensatz wird umgeschrieben.

  Der Rücklauf aus der Sicherung (`app.ist_dienst()`) spielt den Bestand
  zurück, wie er war, und ist ausgenommen.
*/

create or replace function app.wartung_keine_zukunft() returns trigger
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if app.ist_dienst() then
    return new;
  end if;
  if new.zuletzt_am is not null and new.zuletzt_am > heute
     and (tg_op = 'INSERT' or new.zuletzt_am is distinct from old.zuletzt_am) then
    raise exception 'Der Tag der Wartung (%) liegt in der Zukunft — eingetragen wird eine Wartung, die schon gemacht ist',
      to_char(new.zuletzt_am, 'DD.MM.YYYY') using errcode = '22023';
  end if;
  if new.baujahr is not null and new.baujahr > extract(year from heute)
     and (tg_op = 'INSERT' or new.baujahr is distinct from old.baujahr) then
    raise exception 'Das Baujahr % liegt in der Zukunft', new.baujahr using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function app.wartung_keine_zukunft() from public, anon, authenticated;

drop trigger if exists wartungen_keine_zukunft on public.wartungen;
create trigger wartungen_keine_zukunft
  before insert or update of zuletzt_am, baujahr on public.wartungen
  for each row execute function app.wartung_keine_zukunft();
