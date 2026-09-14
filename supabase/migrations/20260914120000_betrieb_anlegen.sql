-- Einen Betrieb anlegen — die Zeilen dazu, in EINER Klammer.
--
-- Die Edge Function `betrieb-anlegen` legt das Anmeldekonto an; das kann nur
-- sie, denn Konten entstehen im Anmeldedienst und nicht in einer Tabelle.
-- Alles Weitere gehoert hierher: Firma, erster Administrator, Protokolleintrag.
--
-- WARUM NICHT DREI EINFUEGUNGEN IN DER FUNCTION. Ein Betrieb ohne
-- Administrator ist nicht zu betreten und nicht zu reparieren — niemand kann
-- sich anmelden, um den fehlenden anzulegen. Unter Firestore hielt ein Stapel
-- das zusammen; hier tut es eine Funktion, und die ist eine Transaktion.
--
-- SIE PRUEFT NICHT, WER SIE AUFRUFT, und das ist Absicht: erreichbar ist sie
-- nur mit dem Dienstschluessel, den allein die Edge Function hat. Die Frage
-- „darf dieser Aufrufer" beantwortet die Function, weil nur sie das Token des
-- Menschen sieht. Eine zweite, halbe Pruefung hier waere eine, die niemand
-- gegen die erste haelt.

create or replace function public.betrieb_anlegen(
  p_kennung text,
  p_name text,
  p_admin_uid uuid,
  p_admin_name text,
  p_admin_email text,
  p_angelegt_von uuid
) returns jsonb
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  -- Die Kennung ist der Mandantenschluessel. Ein zweiter Betrieb darauf
  -- vermischte seine Daten mit dem bestehenden, und zwar unbemerkt.
  if exists (select 1 from public.companies c where c.id = p_kennung) then
    raise exception 'Die Kennung „%" ist vergeben. Ein zweiter Betrieb darauf würde seine Daten mit dem bestehenden vermischen.', p_kennung
      using errcode = '23505';
  end if;

  /*
    DIE VORGABEWERTE STEHEN HIER UND NICHT IN DER FUNCTION.

    Stundensaetze, Zuschlaege, Steuersatz, Zahlungsziel: ein neuer Betrieb
    rechnet vom ersten Tag an, auch bevor jemand die Einstellungen oeffnet.
    Fehlten sie, stuende auf der ersten Rechnung eine Null — und niemand
    suchte den Fehler in einem leeren Feld.
  */
  insert into public.companies (id, name, rates)
  values (p_kennung, p_name, jsonb_build_object(
    'fach', 65, 'helper', 45,
    'nightSurcharge', 0.5, 'emergencySurcharge', 1,
    'vatRate', 0.2, 'dueDays', 14));

  insert into public.users (id, company_id, name, email, role, active)
  values (p_admin_uid, p_kennung, p_admin_name, p_admin_email, 'Administrator', true);

  insert into public.betriebsanlagen
    (betrieb_kennung, name, angelegt_von, erster_admin_uid)
  values (p_kennung, p_name, p_angelegt_von, p_admin_uid);

  return jsonb_build_object('companyId', p_kennung, 'ersterAdminUid', p_admin_uid);
end;
$$;

-- Nur der Dienstschluessel. Ein angemeldeter Mensch kommt hier nicht heran —
-- der Weg fuehrt ueber die Edge Function, die sein Token prueft.
revoke all on function public.betrieb_anlegen(text, text, uuid, text, text, uuid) from public;
revoke all on function public.betrieb_anlegen(text, text, uuid, text, text, uuid) from anon, authenticated;
grant execute on function public.betrieb_anlegen(text, text, uuid, text, text, uuid) to service_role;
