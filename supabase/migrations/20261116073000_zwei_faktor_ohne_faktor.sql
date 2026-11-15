-- K6 (Durchsicht 15.11.2026): wer beim Einschalten der Zwei-Faktor-Pflicht noch keinen Faktor hat.

/*
  WAS FEHLTE. Die Pflicht wirkt sofort (`app.zweiter_faktor_verlangt`): ab dem
  Speichern liefert jede Regel Kolleginnen der Leitung und Buchhaltung ohne
  Faktor nichts mehr. Wer sie einschaltete, erfuhr aber nicht, wen das
  trifft — `plattform_leitung_mit_zweitem_faktor` gab es nur für die
  Plattform. Jetzt sieht die Geschäftsführung bzw. Administration vor dem
  Einschalten, wer noch keinen Faktor hat (und solange die Pflicht gilt, wer
  noch fehlt). Die App führt die Betroffenen sofort zur Einrichtung.

  NUR NAMEN UND ROLLEN — ob jemand einen Faktor hat, ist für die Leitung
  eine Frage der Zugangssicherheit des Betriebs; das Geheimnis selbst und
  die Codes bleiben, wo sie sind.
*/
create or replace function public.zwei_faktor_ohne_faktor()
  returns table (uid uuid, name text, rolle text)
  language plpgsql
  stable
  security definer
  set search_path = ''
as $$
declare
  mein_betrieb text := app.betrieb();
begin
  if mein_betrieb is null or not app.betriebsmitglied(mein_betrieb)
     or not app.hat_rolle(array['Geschäftsführung', 'Administrator']) then
    raise exception 'Nur Geschäftsführung oder Administration' using errcode = '42501';
  end if;
  return query
    select u.id, u.name, u.role
      from public.users u
     where u.company_id = mein_betrieb and u.active
       and app.zwei_faktor_rolle(u.role)
       and not app.zweiter_faktor_eingerichtet(u.id)
     order by u.name, u.id;
end;
$$;

revoke all on function public.zwei_faktor_ohne_faktor() from public, anon;
grant execute on function public.zwei_faktor_ohne_faktor() to authenticated;
