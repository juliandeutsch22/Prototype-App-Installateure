-- K10 (Paket 8, 16.11.2026): offene Passwort-Bitten gehen mit, wenn ein Konto gesperrt wird.

/*
  WAS BLIEB. Eine Bitte um ein neues Passwort (V14) blieb offen, wenn das
  Konto danach deaktiviert wurde — oder der ganze Betrieb. Die Startseite
  filterte Deaktivierte heraus, in der Tabelle stand die Bitte aber weiter
  als offen, und nach einem Aktivieren tauchte sie wieder auf, als hätte
  jemand gerade gefragt.

  JETZT schließt `app.konto_sperren` (Deaktivieren eines Kontos und eines
  Betriebs) offene Bitten des Kontos ab, mit dem Vermerk „deaktiviert“. Der
  Rumpf ist sonst derselbe wie in 20261116070000 (K2).
*/

alter table public.passwort_anfragen drop constraint if exists passwort_anfragen_erledigt_wie_check;
alter table public.passwort_anfragen add constraint passwort_anfragen_erledigt_wie_check
  check (erledigt_wie in ('startpasswort', 'verworfen', 'deaktiviert'));

create or replace function app.passwort_anfragen_schliessen(p_uid uuid) returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.passwort_anfragen a
     set erledigt_am = now(), erledigt_wie = 'deaktiviert'
   where a.user_id = p_uid and a.erledigt_am is null
$$;

revoke all on function app.passwort_anfragen_schliessen(uuid) from public, anon, authenticated;

create or replace function app.konto_sperren(p_uid uuid, p_aktiv boolean) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update auth.users
     set banned_until = case
           when p_aktiv then null
           /*
             HUNDERT JAHRE UND NICHT `infinity`. Gemessen, nicht vermutet:
             `infinity` ist ein gueltiger Zeitstempel fuer Postgres, aber der
             Anmeldedienst liest die Spalte in einen Zeittyp, der ihn nicht
             kennt — und antwortet auf JEDEN Anmeldeversuch mit einem
             Serverfehler, auch bei Konten, die gar nicht gesperrt sind.
             Eine Sperre, die die Anmeldung des ganzen Betriebs lahmlegt,
             waere ein teurer Weg, einen Mitarbeiter auszusperren.
           */
           else now() + interval '100 years'
         end
   where id = p_uid;

  if not p_aktiv then
    delete from auth.sessions where user_id = p_uid;
    delete from auth.refresh_tokens where user_id = p_uid::text;
    -- K2: das gesperrte Konto bekommt auf keinem Gerät mehr Meldungen.
    perform app.push_anmeldungen_entfernen(p_uid);
    -- K10: wer gesperrt ist, bekommt kein neues Passwort — die Bitte ist erledigt.
    perform app.passwort_anfragen_schliessen(p_uid);
  end if;
end;
$$;

revoke all on function app.konto_sperren(uuid, boolean) from public, anon, authenticated;
