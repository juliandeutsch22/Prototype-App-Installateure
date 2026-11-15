/*
  DIE ZÄHLLISTEN NUR LESEN (Nachtrag zu F14, `20261117032000_inventur_zaehlliste.sql`).

  Dort wurde `anon` alles entzogen und `authenticated` das Lesen gegeben —
  die übrigen Rechte, die Supabase einer neuen Tabelle von Haus aus gibt
  (Einfügen, Ändern, Löschen, Leeren), blieben bei `authenticated` stehen.
  Der Zeilenschutz ließ trotzdem nichts durch, denn Schreibregeln gibt es
  keine; `truncate` aber fragt den Zeilenschutz nicht. Geschrieben wird nur
  über die Funktionen der Inventur — so wie bei `lagerbestaende` und
  `befehle_vorgaenge` (alles entziehen, Lesen geben).
*/
revoke all on public.inventuren from public, anon, authenticated;
revoke all on public.inventur_zeilen from public, anon, authenticated;
grant select on public.inventuren to authenticated;
grant select on public.inventur_zeilen to authenticated;
