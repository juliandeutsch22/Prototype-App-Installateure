-- Testbericht Runde 6, Abschnitt 8.4 Schritt 3 (27.10.2026).
--
-- Fünf Funktionen mit den Rechten ihres Eigentümers waren auch OHNE Anmeldung
-- aufrufbar (`anon` bzw. `public` hatte EXECUTE). Jede prüft im Rumpf die
-- Anmeldung selbst und bricht ohne sie ab — offen lag also nichts. Aber
-- verbindlich ist (CLAUDE.md): `revoke … from public, anon`, nur der nötige
-- `grant`. Die Sperre gehört an die Tür, nicht erst in den Rumpf: ein
-- künftiger Fehler im Rumpf stünde sonst jedem im Netz offen.
-- `tests/supabase/mandantenTrennung.test.ts` hält das für jede Funktion fest.

revoke execute on function public.betrieb_auszug(integer) from public, anon;
revoke execute on function public.schein_vorbereiten(text, date) from public, anon;
revoke execute on function public.support_freigaben_offen() from public, anon;
revoke execute on function public.support_notzugang(text, text, integer) from public, anon;
revoke execute on function public.urlaub_entscheiden(uuid, text, text, text) from public, anon;

grant execute on function public.betrieb_auszug(integer) to authenticated;
grant execute on function public.schein_vorbereiten(text, date) to authenticated;
grant execute on function public.support_freigaben_offen() to authenticated;
grant execute on function public.support_notzugang(text, text, integer) to authenticated;
grant execute on function public.urlaub_entscheiden(uuid, text, text, text) to authenticated;
