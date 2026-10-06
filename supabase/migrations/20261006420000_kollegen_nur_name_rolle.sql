/*
  MONTEURE SEHEN VON KOLLEGEN NUR NAME, ROLLE, EINSTUFUNG (Testbericht
  Runde 3, G25)

  WAS DER BERICHT FAND. Über die Schnittstelle las ein Monteur die ganzen
  Zeilen der Belegschaft: E-Mail-Adressen, Freigaben (Kunden pflegen,
  Katalog, Einkauf, Rechnungen lesen), Soll-Stunden, Arbeitstage, Eintritt,
  Lehrbeginn. Die Oberfläche zeigt davon nichts — gebraucht wird es auch
  nicht. „Vertretbar, aber mehr als nötig.“

  WAS JETZT GILT.
  - Die volle Zeile liest jeder von sich selbst. Von anderen liest sie, wer
    im Betrieb plant, verwaltet oder abrechnet: Verwaltung, Buchhaltung,
    Projektleitung, Geschäftsführung, Administration — und der Support im
    Einblick wie bisher. Diese Rollen brauchen die Spalten: Einsatzplanung
    (Arbeitstage, Einstufung), Zeitkonten und Lohn (Soll, Eintritt),
    Urlaub (Anspruch), Benutzerverwaltung (alles).
  - Die Rolle „Mitarbeiter“ (Monteur, Lehrling, Helfer) liest von anderen
    über `public.kollegen()` nur Kennung, Name, Rolle, Einstufung und ob das
    Konto aktiv ist — genug für Team-Woche, Termine (Teilnehmer) und „Mein
    Einsatzplan“.

  WARUM AN DER ZEILE UND NICHT AN DEN SPALTEN. Spaltenrechte gelten je
  Datenbankrolle, nicht je Rolle im Betrieb: alle Angemeldeten sind
  `authenticated`. Die Leseregel kann dagegen die Rolle fragen.

  WAS NICHTS MERKT. Jede Datenbankfunktion, die die Belegschaft liest, läuft
  mit den Rechten ihres Eigentümers (geprüft für alle Fassungen); die einzige
  Regel mit einer Unterabfrage auf `users` (`material_orders_anlegen`) gilt
  nur für die Führung. `app.rolle()` liest die eigene Zeile mit
  Eigentümerrechten — keine Schleife.
*/

drop policy if exists users_lesen on public.users;
create policy users_lesen on public.users
  for select using (
    app.darf(company_id)
    and (id = auth.uid() or app.rolle() is distinct from 'Mitarbeiter'));

/*
  DIE KOLLEGEN, SOWEIT JEDER SIE SEHEN DARF: Kennung, Name, Rolle,
  Einstufung, aktiv — für alle im eigenen Betrieb (beim Support: im Betrieb
  des Einblicks).
*/
create or replace function public.kollegen()
  returns table (id uuid, company_id text, name text, role text, active boolean, einstufung text)
  language sql stable
  security definer
  set search_path = ''
as $$
  select u.id, u.company_id, u.name, u.role, u.active, u.einstufung
    from public.users u
   where app.angemeldet()
     and u.company_id = app.betrieb()
     and app.darf(u.company_id)
   order by u.name
$$;

revoke all on function public.kollegen() from public, anon;
grant execute on function public.kollegen() to authenticated;
