/*
  DER WOCHENPLAN FÜR ALLE — AB WERK AN (offene Punkte A5).

  Entschieden am 28.09.2026: jeder Mitarbeiter soll sehen können, wer an
  welchem Tag auf welcher Baustelle ist. Die Einsätze der Kollegen durfte er
  über die Zeilenregel ohnehin schon lesen; der Prüflauf fragte, ob das
  gewollt ist (P3-25) — es ist gewollt.

  DER SCHALTER BLEIBT. Ein Betrieb, der es anders will, schaltet in den
  Einstellungen ab. Was sich ändert, ist nur die Vorgabe — für neue Betriebe
  und einmalig für die bestehenden, bei denen der Schalter bis heute auf der
  alten Vorgabe stand. Die Urlaube der anderen bleiben, wie sie waren:
  „abwesend", ohne Grund.
*/
alter table public.companies alter column wochenplan_fuer_alle set default true;

update public.companies set wochenplan_fuer_alle = true where not wochenplan_fuer_alle;

comment on column public.companies.wochenplan_fuer_alle is
  'Zeigt allen Mitarbeitern einen reinen Lese-Wochenplan (wer ist wo; '
  'Abwesenheit ohne Grund). Ab Werk an (seit 28.09.2026).';
