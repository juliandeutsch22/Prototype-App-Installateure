# Schema ebInterface 6.1

`Invoice-6p1.xsd` ist das offizielle Schema des österreichischen
Rechnungsstandards ebInterface in der Fassung 6.1 (Stand 25.06.2022),
unverändert von ebinterface.at übernommen
(SHA-256 `8c736ca0953c5b0128210bc75dfa1b8b96e9743e856b5d339eaf825c137fab7c`).
Die Prüfungen in `tests/unit/ebinterface.test.ts` validieren jede erzeugte
E-Rechnung dagegen.

Das angepasste Schema des Bundes (e-rechnung.gv.at) liegt bewusst nicht hier:
die Rechte liegen beim BRZ. Seine zusätzlichen Regeln stehen als Prüfungen in
`src/features/invoices/ebinterface.ts` (`ebiPruefen`).
