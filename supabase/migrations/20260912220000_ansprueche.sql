-- Die Ansprueche im Token — aus der Belegschaft, nie aus einer Eingabe.
--
-- Bisher zwei Cloud Functions (`syncUserClaims`, `plattformAdminClaim`), die
-- nach dem Schreiben ansprangen und die Firebase-Custom-Claims setzten. Jetzt
-- zwei Trigger. Der Unterschied ist derselbe wie bei der Pruefsumme: sie
-- laufen in derselben Transaktion und fangen jeden Weg.
--
-- WAS DIE ANSPRUECHE SIND. `app.betrieb()`, `app.rolle()` und `app.aktiv()`
-- lesen sie aus dem Token; jede einzelne Richtlinie haengt daran. Sie muessen
-- deshalb aus der Tabelle kommen und niemals aus dem, was ein Client
-- mitschickt.

-- ---------------------------------------------------------------------------
-- Ansprueche schreiben
-- ---------------------------------------------------------------------------

/*
  `security definer`, weil `auth.users` niemandem sonst gehoert — und das soll
  so bleiben. Die Funktion ist der einzige Weg dorthin, und sie schreibt genau
  drei Schluessel.

  ZUSAMMENGEFUEHRT, NICHT ERSETZT. In `raw_app_meta_data` stehen auch
  `provider` und `providers`; die braucht die Anmeldung selbst. Ein
  vollstaendiges Ersetzen — was `setCustomUserClaims` in Firebase tat — wuerde
  sie wegraeumen. Was weg soll, wird deshalb ausdruecklich entfernt.
*/
create or replace function app.ansprueche_setzen(
  p_uid uuid,
  p_setzen jsonb,
  p_loeschen text[] default '{}'
) returns void
  language plpgsql
  security definer
  set search_path = ''
as $$
begin
  update auth.users
     set raw_app_meta_data =
           (coalesce(raw_app_meta_data, '{}'::jsonb) - p_loeschen) || p_setzen
   where id = p_uid;
end;
$$;

revoke all on function app.ansprueche_setzen(uuid, jsonb, text[]) from public;

/*
  DEAKTIVIEREN MUSS DEN SERVER ERREICHEN, NICHT NUR DIE OBERFLAECHE.

  Ein ausgeschiedener Mitarbeiter behielt sonst ein gueltiges Konto mit
  gueltigen Anspruechen: mit seinem Passwort und der Schnittstelle kaeme er
  unveraendert an Kunden, Baustellen und Scheine — die App liesse ihn nur
  nicht mehr hinein. „Deaktiviert" waere eine Anzeigeeinstellung.

  Drei Riegel, weil jeder fuer sich eine Luecke laesst:

    1. `banned_until` sperrt das Konto. Wirkt absolut, aber erst beim
       naechsten Anmeldeversuch.
    2. Die Sitzungen loeschen. Ohne das liefe ein bereits ausgestelltes
       Zugangstoken noch bis zu einer Stunde weiter — laenger nicht, weil es
       sich ohne Sitzung nicht mehr erneuern laesst.
    3. Der Anspruch `active`, den `app.aktiv()` prueft — er greift auch dort,
       wo ein Token noch gueltig scheint.

  Das Zuruecknehmen gehoert dazu: ohne das Aufheben der Sperre kaeme ein
  wieder eingestellter Mitarbeiter nie mehr herein, und niemand faende den
  Grund, weil in der Tabelle alles richtig aussaehe.
*/
create or replace function app.konto_sperren(p_uid uuid, p_aktiv boolean)
  returns void
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
  end if;
end;
$$;

revoke all on function app.konto_sperren(uuid, boolean) from public;

-- ---------------------------------------------------------------------------
-- Die Belegschaft
-- ---------------------------------------------------------------------------

create or replace function app.ansprueche_aus_belegschaft() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  perform app.ansprueche_setzen(
    new.id,
    jsonb_build_object('company_id', new.company_id, 'role', new.role,
                       'active', new.active));
  /*
    HIER WIRD NICHTS WEGGERAEUMT, und das ist gemessen: ein Wegraeumen von
    `plattform_admin` waere unerreichbar. Der Riegel
    `a_users_kein_plattformkonto` laesst eine Plattformkennung gar nicht erst
    in die Belegschaft, und das Entfernen aus `platform_admins` nimmt den
    Anspruch selbst mit. Eine Zeile, die nie greift, ist keine zweite
    Sicherung — sie ist eine Behauptung, die niemand pruefen kann.
  */
  perform app.konto_sperren(new.id, new.active);
  return null;
end;
$$;

/*
  Beim LOESCHEN geschieht nichts — genauso wie bisher. Die Zeile verschwindet
  ohnehin nur, wenn das Konto selbst geloescht wird (`on delete cascade`), und
  dann gibt es keine Ansprueche mehr zu setzen. Ein Mitarbeiter, der geht,
  wird deaktiviert und nicht geloescht; darauf verweisen Zeitbuchungen,
  Anforderungen und Einsaetze.
*/
create trigger users_ansprueche
  after insert or update on users
  for each row execute function app.ansprueche_aus_belegschaft();

-- ---------------------------------------------------------------------------
-- Der globale Administrator
-- ---------------------------------------------------------------------------

/*
  EIN GLOBALER ADMINISTRATOR GEHOERT ZU KEINEM BETRIEB — UND DAS WIRD HIER
  DURCHGESETZT, NICHT NUR ANGENOMMEN.

  Gaebe es fuer dieselbe Kennung beides, entschiede allein die Reihenfolge der
  beiden Trigger, welche Ansprueche am Ende stehen: mal ein Plattformkonto,
  mal ein Konto MIT Betrieb — und mit einem Betrieb im Token greift jede
  einzelne Leseregel. Ein Zufall entschiede also ueber Leserechte an fremden
  Kundendaten.

  UNTERSCHIED ZUR FIRESTORE-FASSUNG: dort wurde der Fall protokolliert und die
  Zeile blieb stehen — ein Eintrag in `platformAdmins`, der nichts bewirkte.
  Hier bricht das Anlegen ab. Eine Zeile, die etwas behauptet, was nicht gilt,
  ist schlimmer als eine Fehlermeldung; und an diese Tabelle kommt ohnehin nur
  heran, wer den Dienstschluessel hat.
*/
create or replace function app.plattform_anspruch() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app.ansprueche_setzen(old.id, '{}'::jsonb, array['plattform_admin']);
    perform app.konto_sperren(old.id, true);
    return old;
  end if;

  if exists (select 1 from public.users u where u.id = new.id) then
    raise exception
      'Diese Kennung gehört bereits zu einem Betrieb — ein Plattformkonto braucht ein eigenes'
      using errcode = '23505';
  end if;

  perform app.ansprueche_setzen(
    new.id,
    jsonb_build_object('plattform_admin', true),
    array['company_id', 'role', 'active']);
  return new;
end;
$$;

create trigger platform_admins_anspruch
  after insert or update or delete on platform_admins
  for each row execute function app.plattform_anspruch();

/*
  UND DIE GEGENRICHTUNG. Wer schon Plattformkonto ist, darf nicht nachtraeglich
  in einen Betrieb aufgenommen werden — sonst entstuende dasselbe Zwitterkonto
  von der anderen Seite her.
*/
create or replace function app.kein_plattformkonto_im_betrieb() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if exists (select 1 from public.platform_admins p where p.id = new.id) then
    raise exception
      'Diese Kennung ist ein Plattformkonto und gehört in keinen Betrieb'
      using errcode = '23505';
  end if;
  return new;
end;
$$;

create trigger a_users_kein_plattformkonto
  before insert or update on users
  for each row execute function app.kein_plattformkonto_im_betrieb();
