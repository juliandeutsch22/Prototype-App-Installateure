-- ---------------------------------------------------------------------------
-- Im Firmenbuch eingetragen — die eigene Angabe des Betriebs (A12 der
-- Durchsicht vom 24.10.2026)
--
-- Ob ein Betrieb Firmenbuchnummer und -gericht auf seine Belege setzen muss
-- (§ 14 UGB), las die App aus der Rechtsform im Firmennamen. Ein
-- eingetragenes Einzelunternehmen muss „e.U.“ aber nicht im Namen führen,
-- wie die App es sucht — es bekam keine Warnung.
--
-- Leer heisst: es zählt die Rechtsform im Namen, wie bisher (Altbestand
-- bleibt unverändert). Gesetzt wird der Wert nur, wo er davon abweicht.
-- ---------------------------------------------------------------------------

alter table public.companies
  add column if not exists im_firmenbuch boolean;

comment on column public.companies.im_firmenbuch is
  'Im Firmenbuch eingetragen (§ 14 UGB: Firmenbuchnummer und -gericht auf den Belegen). Leer: die Rechtsform im Firmennamen entscheidet. Gesetzt nur, wo die eigene Angabe davon abweicht (A12).';
