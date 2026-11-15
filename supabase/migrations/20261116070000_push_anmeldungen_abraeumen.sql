-- K2 (Durchsicht 15.11.2026): ein verlorenes Telefon bekommt keine Meldungen mehr.

/*
  WAS FEHLTE. „Auf allen Geräten abmelden“, „Benutzer deaktivieren“ und ein
  neues Startpasswort beendeten die Anmeldung (oder ließen sie bewusst
  stehen) — die Push-Anmeldungen der Geräte blieben aber in
  `user_prefs.push_tokens`. Ein verlorenes Telefon zeigte deshalb weiter
  Meldungen am Sperrbildschirm: neue Nachrichten (mit Vorschau), den
  Einsatzplan mit Kundennamen, Abwesenheiten. Abmelden konnte es sich selbst
  nicht mehr — es hatte ja keine Sitzung.

  DIE REGEL, die jetzt an EINER Stelle steht: wo die Datenbank die
  Sitzungen eines Kontos gewaltsam beendet oder das Konto sperrt, gehen
  dessen Push-Anmeldungen mit. Das sind `app.sitzungen_beenden`
  (Rollenwechsel, Notzugang-Passwort, Umstellung auf Benutzername,
  Zurücksetzen des zweiten Faktors) und `app.konto_sperren` (Deaktivieren
  eines Kontos und eines ganzen Betriebs).

  WARUM DAS FÜR DIE EIGENEN GERÄTE KEIN SCHADEN IST. Ein Gerät, auf dem die
  App weiter benutzt wird, meldet sich beim nächsten Start selbst wieder an
  (`pushAbgleichen` in `src/lib/push.ts`): der Merker „hier eingeschaltet“
  liegt auf dem Gerät, nicht in der Datenbank. Wer also nach einem
  Rollenwechsel neu anmeldet, bekommt seine Meldungen ohne einen Handgriff
  zurück; nur das Gerät, das niemand mehr öffnet, bleibt still.

  DIE ALTEN ZEILEN bleiben, wie sie sind (die Produktion wird nicht
  umgeschrieben): wer schon deaktiviert ist, hat womöglich noch Anmeldungen
  stehen. Deshalb filtert der Versand zusätzlich nach „aktiv“
  (`push_vorgaben`, unten).
*/

create or replace function app.push_anmeldungen_entfernen(p_uid uuid) returns void
  language sql
  security definer
  set search_path = ''
as $$
  update public.user_prefs
     set push_tokens = '{}'::text[], updated_at = now()
   where user_id = p_uid
     and cardinality(push_tokens) > 0
$$;

revoke all on function app.push_anmeldungen_entfernen(uuid) from public, anon, authenticated;

-- Der Rumpf bis auf die eine Zeile wie in 20260912220000_ansprueche.sql.
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
  end if;
end;
$$;

revoke all on function app.konto_sperren(uuid, boolean) from public, anon, authenticated;

create or replace function app.sitzungen_beenden(p_uid uuid) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  delete from auth.sessions where user_id = p_uid;
  delete from auth.refresh_tokens where user_id = p_uid::text;
  -- K2: ohne Sitzung kann sich ein Gerät nicht mehr selbst abmelden.
  perform app.push_anmeldungen_entfernen(p_uid);
end;
$$;

revoke all on function app.sitzungen_beenden(uuid) from public, anon, authenticated;

/*
  „AUF ALLEN GERÄTEN ABMELDEN“ läuft beim Anmeldedienst (`signOut` mit
  `global`), und der fragt die Datenbank nicht. Die App ruft deshalb vorher
  diese Funktion — solange ihre eigene Sitzung noch gilt. Sie kann nur das
  eigene Konto betreffen; mehr als die eigenen Anmeldungen ist hier nicht zu
  holen.
*/
create or replace function public.push_geraete_abmelden() returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  if auth.uid() is null or not app.sitzung_lebt() then
    raise exception 'Nicht angemeldet' using errcode = '42501';
  end if;
  perform app.push_anmeldungen_entfernen(auth.uid());
end;
$$;

revoke all on function public.push_geraete_abmelden() from public, anon;
grant execute on function public.push_geraete_abmelden() to authenticated;

/*
  DAS NEUE STARTPASSWORT (`passwort-vergeben`) beendet die Sitzungen nicht —
  beim vergessenen Passwort ist das richtig. Die Push-Anmeldungen gehen aber:
  Geräte, auf denen die App weiter läuft, melden sich beim nächsten Start
  wieder an; das verlorene Telefon nicht. Nur der Dienst ruft das, nachdem
  die Function Rolle und Betrieb geprüft hat.
*/
create or replace function public.push_geraete_vergessen(p_uid uuid) returns void
  language sql
  security definer
  set search_path = ''
as $$
  select app.push_anmeldungen_entfernen(p_uid)
$$;

revoke all on function public.push_geraete_vergessen(uuid) from public, anon, authenticated;
grant execute on function public.push_geraete_vergessen(uuid) to service_role;

/*
  WER EINE MELDUNG BEKOMMT, IST AKTIV. Die Empfängerkreise kommen aus
  verschiedenen Quellen — die Projektleitung aus der Baustelle, der
  Besteller aus der Anforderung, der Antragsteller aus der Abwesenheit — und
  nicht jede fragte nach „aktiv“: ein deaktivierter Projektleiter, der noch
  an der Baustelle steht, bekam Eilmeldungen weiter. Statt jede Quelle
  einzeln nachzuziehen, liest der Versand die Geräte nur noch hier, und hier
  gilt: Konto aktiv, Betrieb ruht nicht. Das deckt auch die Altdaten
  (Anmeldungen deaktivierter Konten aus der Zeit vor dieser Migration).
*/
create or replace function public.push_vorgaben(p_uids uuid[])
  returns setof public.user_prefs
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select p.*
    from public.user_prefs p
    join public.users u on u.id = p.user_id and u.company_id = p.company_id
   where p.user_id = any(p_uids)
     and u.active
     and not app.betrieb_ruht(u.company_id)
$$;

revoke all on function public.push_vorgaben(uuid[]) from public, anon, authenticated;
grant execute on function public.push_vorgaben(uuid[]) to service_role;
