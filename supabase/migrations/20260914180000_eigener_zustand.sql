-- Was ein Konto ueber SICH SELBST erfahren darf, auch wenn es nichts mehr darf.
--
-- DAS PROBLEM, GEMESSEN UND NICHT VERMUTET. Wird jemand mitten in der Sitzung
-- deaktiviert, filtert der Zeilenschutz seine eigene Zeile weg: die Abfrage
-- gelingt und liefert NICHTS. Fuer die Anmeldung sieht das genauso aus wie
-- „dieses Konto hat gar kein Profil" — und auf dem Bildschirm stand dann
-- „Kein Benutzerprofil fuer dieses Konto gefunden. Bitte an die Verwaltung
-- wenden."
--
-- Das ist nicht falsch und trotzdem die schlechtere Auskunft. Wer gerade
-- ausgeschieden ist, soll lesen, dass sein Zugang beendet wurde, und nicht
-- raten, ob etwas kaputt ist. Unter Firestore stand die Angabe im Dokument,
-- das er noch lesen durfte; hier braucht es eine Funktion, die an der
-- Zeilenregel vorbeisieht.
--
-- SIE GIBT ZWEI WAHRHEITSWERTE ZURUECK UND SONST NICHTS — keinen Namen, keine
-- Rolle, keinen Betrieb. Ueber sich selbst, und nur ueber den Aufrufer: `p`
-- gibt es nicht, gefragt wird immer `auth.uid()`. Damit laesst sich mit ihr
-- weder ein fremdes Konto ausforschen noch pruefen, ob es eine Adresse gibt.
create or replace function public.mein_zustand() returns jsonb
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select case
    when auth.uid() is null then jsonb_build_object('vorhanden', false, 'aktiv', false)
    else coalesce(
      (select jsonb_build_object('vorhanden', true, 'aktiv', u.active)
         from public.users u where u.id = auth.uid()),
      jsonb_build_object('vorhanden', false, 'aktiv', false))
  end
$$;

revoke all on function public.mein_zustand() from public, anon;
grant execute on function public.mein_zustand() to authenticated;
