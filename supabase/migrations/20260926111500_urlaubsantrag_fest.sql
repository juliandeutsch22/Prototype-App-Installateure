-- EIN URLAUBSANTRAG IST, WAS BEANTRAGT WURDE — UND WAS ENTSCHIEDEN IST, BLEIBT.
--
-- Aus dem Prüflauf vom 25.09.2026:
--
--   P1-08  Der Antragsteller konnte einen entschiedenen Antrag über die
--          Schnittstelle weiter anfassen: einen stornierten wieder auf
--          „Beantragt" setzen und danach löschen, Zeitraum und Tage ändern.
--          `app.urlaub_entscheidung_geschuetzt` schloss nur „Genehmigt" und
--          „Abgelehnt" — und das nur für den, der nicht selbst entscheiden
--          darf.
--   P3-13  `vacations_aendern` lässt die ganze Führung an fremde Anträge,
--          also auch die Projektleitung, die über Urlaub gar nicht
--          entscheidet. Sie konnte einen offenen Antrag eines Kollegen
--          stornieren oder seinen Zeitraum verschieben.
--   P3-24  Ein Antrag konnte sich zwischen dem Blick des Genehmigenden und
--          seinem Klick ändern: genehmigt wurde dann ein anderer Zeitraum
--          als der, der auf dem Schirm stand.
--
-- DIE APP ÄNDERT EINEN ANTRAG NIE DIREKT. Beantragen ist ein Einfügen,
-- Zurückziehen ein Löschen des eigenen offenen Antrags, und alles andere —
-- genehmigen, ablehnen, einen genehmigten zurücknehmen — läuft über
-- `urlaub_entscheiden` (siehe `lib/db/pg/vacations.ts`). Diese Funktion,
-- `urlaub_eintragen` und der Betriebsurlaub laufen mit den Rechten ihres
-- Eigentümers und sind von dem Wächter hier nicht betroffen
-- (`current_user`, wie bei `app.urlaub_nur_ueber_antrag`).
--
-- Der Wächter regelt also nur den Weg an der App vorbei, und dort gilt:
--
--   1. Zeitraum und Umfang eines Antrags (Person, von, bis, Tage, Art,
--      Stunden des Zeitausgleichs, der Saldo beim Antrag) ändern sich nicht.
--      Wer etwas anderes will, zieht zurück und beantragt neu. Damit ist,
--      was der Genehmigende sieht, auch das, was er genehmigt (P3-24) —
--      ohne dass sich an `urlaub_entscheiden` und damit an der App etwas
--      ändert.
--   2. An einen FREMDEN Antrag kommt nur, wer über Urlaub entscheiden darf
--      (`app.darf_urlaub_entscheiden`). Die Projektleitung LIEST Anträge
--      weiter — sie plant damit —, sie ändert sie nicht (P3-13).
--   3. Ein ENTSCHIEDENER Antrag (genehmigt, abgelehnt, storniert) ist für
--      den Antragsteller zu. Zurückgenommen wird ein genehmigter über die
--      Seite Urlaub, und das macht, wer entscheidet (P1-08).
--
-- Warum ein Wächter und keine engere Richtlinie: eine Richtlinie, die nicht
-- passt, trifft still null Zeilen. Hier soll die Antwort sagen, WARUM nicht.

create or replace function app.urlaub_antrag_fest() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if app.ist_dienst() or current_user <> 'authenticated' then
    return new;
  end if;

  if new.user_id is distinct from old.user_id
     or new.von is distinct from old.von
     or new.bis is distinct from old.bis
     or new.tage is distinct from old.tage
     or new.art is distinct from old.art
     or new.za_von is distinct from old.za_von
     or new.za_bis is distinct from old.za_bis
     or new.za_stunden is distinct from old.za_stunden
     or new.saldo_bei_antrag is distinct from old.saldo_bei_antrag then
    raise exception 'Zeitraum und Umfang eines Antrags ändern sich nicht mehr — bitte zurückziehen und neu beantragen'
      using errcode = '42501';
  end if;

  if old.user_id is distinct from auth.uid()
     and not app.darf_urlaub_entscheiden(old.company_id) then
    raise exception 'Einen fremden Antrag ändert nur, wer über Urlaub entscheidet'
      using errcode = '42501';
  end if;

  if old.user_id = auth.uid() and old.status <> 'Beantragt' then
    raise exception 'Der Antrag ist schon entschieden — einen genehmigten Urlaub nimmt auf der Seite Urlaub zurück, wer darüber entscheidet'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists vacations_antrag_fest on public.vacations;
create trigger vacations_antrag_fest
  before update on public.vacations
  for each row execute function app.urlaub_antrag_fest();
