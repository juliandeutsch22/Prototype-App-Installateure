/*
  INDIZES FÜR DIE WEGE, DIE MIT DEN JAHREN UND MIT ALLEN BETRIEBEN WACHSEN
  (Analyse vom 09.10.2026, Maßnahme 4). Nur Indizes — keine Zeile, keine
  Regel und keine Funktion ändert sich.

  - DATANORM-Übernahme: je Katalogzeile zweimal „Artikel dieses Betriebs mit
    dieser Artikelnummer“. Ohne Index liest das jedes Mal alle Artikel des
    Betriebs — bei 50.000 Zeilen gegen 50.000 Artikel ein quadratischer Lauf.
  - „Frei im Lager“ (`app.lager_zugesagt`, `app.ruest_reserviert`) läuft bei
    jeder Zusage aus dem Lager und sucht nach dem Artikel, ohne Betrieb: ohne
    Index die Anforderungen und Rüstlisten ALLER Betriebe. Gezählt wird nur
    der eigene Artikel; es ist eine Frage der Zeit, nicht des Schutzes.
  - Rechnungen: die Liste (jüngste zuerst nach dem Anlegen), die Baustelle,
    die Kundenakte (Kunde oder Baustelle des Kunden).
  - Scheine: die Liste, jüngste zuerst nach dem Anlegen.
*/

create index if not exists materials_artikelnummer
  on public.materials (company_id, article_number);

create index if not exists material_orders_artikel
  on public.material_orders (material_id) where material_id is not null;

create index if not exists einsatz_material_positionen_artikel
  on public.einsatz_material_positionen (material_id) where material_id is not null;

create index if not exists invoices_betrieb_angelegt
  on public.invoices (company_id, created_at desc);

create index if not exists invoices_baustelle
  on public.invoices (company_id, project_number);

create index if not exists invoices_kunde
  on public.invoices (company_id, customer_id) where customer_id is not null;

create index if not exists invoices_baustelle_id
  on public.invoices (company_id, project_id) where project_id is not null;

create index if not exists work_sheets_betrieb_angelegt
  on public.work_sheets (company_id, created_at desc);
