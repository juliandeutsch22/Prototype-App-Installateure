-- „Deaktiviert" heisst ab sofort und nicht in einer Stunde.
--
-- GEMESSEN, NICHT VERMUTET. Nach dem Deaktivieren eines Kontos konnte dessen
-- bereits ausgestelltes Zugangstoken WEITER lesen und schreiben — bis zu
-- seiner Laufzeit, also bis zu einer Stunde. Das Konto war gesperrt, die
-- Sitzung geloescht, das Erneuern abgewiesen; das alte Token aber traegt
-- seine Ansprueche IN SICH, und darin stand `active: true`.
--
-- Unter Firestore war es genauso: `setCustomUserClaims` wirkt erst beim
-- naechsten Token, und die Regeln lasen ausschliesslich das Token. Der
-- Kommentar dort sprach von drei Riegeln; der dritte hat dieses Fenster nicht
-- geschlossen, weil das alte Token den alten Anspruch traegt.
--
-- In Postgres laesst es sich schliessen, und zwar billig: die Belegschaft
-- steht in derselben Datenbank, einen Primaerschluessel-Zugriff entfernt.
-- Firestore konnte das nicht — ein `get()` in einer Regel kostete dort eine
-- gezaehlte Leseoperation je Prueflauf.

/*
  DER FRAGE NACH DER QUELLE, NICHT NACH DEM TOKEN.

  `security definer` mit einem Eigentuemer, der den Zeilenschutz umgeht: sonst
  fragte die Funktion die Tabelle `users`, deren Richtlinie wiederum
  `app.aktiv()` aufruft — eine Schleife, die sich selbst aufruft.

  DER ANSPRUCH IM TOKEN BLEIBT DIE ZWEITE ANTWORT. Gibt es zur Kennung keine
  Zeile in der Belegschaft, ist es kein Betriebskonto: ein Plattformkonto
  etwa, oder ein Konto, dessen Zeile gerade erst entsteht. Fuer die gilt
  weiter, was im Token steht — und ohne Angabe gilt aktiv, wie ueberall sonst
  in dieser App („u.active !== false").
*/
create or replace function app.aktiv() returns boolean
  language sql stable
  security definer
  set search_path = ''
as $$
  select coalesce(
    (select u.active from public.users u where u.id = auth.uid()),
    (auth.jwt() -> 'app_metadata' ->> 'active')::boolean,
    true)
$$;

revoke all on function app.aktiv() from public;
grant execute on function app.aktiv() to authenticated, anon, service_role;
