/*
  ANGEMELDETE KONTEN OHNE TRUNCATE, TRIGGER UND REFERENCES
  (Durchsicht 15.11.2026, Befund aus F14).

  NACHGESTELLT. Supabase vergibt im Schema `public` jeder neuen Tabelle an
  `authenticated` alle Rechte, auch TRUNCATE, TRIGGER und REFERENCES.
  `20260914090000_anon_zumachen.sql` hat das für `anon` abgeräumt, für
  `authenticated` blieb es stehen: 48 Tabellen und Sichten, darunter
  invoices, time_entries, users, companies, quotes, materials und
  support_zugriffe. Gefunden an `inventuren`/`inventur_zeilen` (F14,
  `20261117034000`).

  WARUM ES WEGGEHÖRT — dieselbe Begründung wie bei `anon`: über PostgREST
  ist keines der drei Rechte erreichbar, heute ist es also kein Loch. Es
  geht um die Reichweite eines künftigen Fehlers. TRUNCATE fragt den
  Zeilenschutz nicht: wer mit der Rolle `authenticated` SQL absetzen kann
  (ein Fehler in einer Funktion mit dynamischem SQL, ein künftiger Zugang),
  leert damit die Tabellen ALLER Betriebe. TRIGGER erlaubte, eigenen Code
  an fremde Zeilen zu hängen, REFERENCES, über einen Fremdschlüssel
  festzustellen, welche Kennungen es gibt.

  GEBRAUCHT WIRD KEINES DAVON als `authenticated`: Auslöser und
  Fremdschlüssel legen die Migrationen als `postgres` an, Abräumen mit
  TRUNCATE tun nur Tests mit dem Dienstschlüssel bzw. als `postgres`,
  Live-Abonnements brauchen SELECT. Geprüft im Code (`src`, `shared`,
  `supabase/functions`) und in den Migrationen.

  SELECT, INSERT, UPDATE und DELETE bleiben, wie sie sind — darüber
  entscheidet der Zeilenschutz. `service_role` und `postgres` behalten alles.

  DIE VORGABE wird mitgeändert, sonst bekäme die nächste Tabelle die Rechte
  wieder. Sie gilt für `postgres`, als der die Migrationen laufen; eine von
  Hand in der Dashboard-Maske angelegte Tabelle (als `supabase_admin`)
  erfasst sie nicht — dafür steht der Wächter in `schema.test.ts`.
*/
revoke truncate, trigger, references on all tables in schema public from authenticated;

alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;
