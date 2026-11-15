/*
  „OFFEN“ IN DER ANGEBOTSLISTE AUS DER DATENBANK (Durchsicht 15.11.2026, A6).

  Die Liste fragt jetzt nach dem Zustand (Entwurf oder versendet), die
  älteste Bindefrist zuerst, und zählt dieselben Zeilen für die Zahl im Kopf
  (`listOffeneQuotes`, `zaehleOffeneQuotes`). Vorher filterte sie nur die
  hundert zuletzt angelegten; ein versendetes Angebot vom Jänner fiel nach
  hundert jüngeren still heraus.

  Dieser Teilindex trägt genau diesen Weg: je Betrieb die offenen nach
  Bindefrist. Offene sind eine kleine Teilmenge aller Angebote; ohne Index
  läse die Datenbank bei einem gewachsenen Betrieb jedes Angebot, um die
  wenigen offenen zu finden. Nur ein Index — nichts wird umgeschrieben.
*/
create index if not exists quotes_offen_nach_frist
  on public.quotes (company_id, valid_until)
  where status in ('Entwurf', 'Versendet');
