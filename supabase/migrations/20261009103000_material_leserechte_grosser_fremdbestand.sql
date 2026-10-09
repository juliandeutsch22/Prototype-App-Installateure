-- Auch eine Abfrage ohne Client-Betriebsfilter muss fremde Großkataloge
-- zügig ausschließen. app.darf(b) = Betriebsmitgliedschaft oder Supportfreigabe;
-- nur die sitzungsabhängigen Teile werden einmal statt je Artikel ausgewertet.
alter policy materials_lesen on public.materials using (
  (company_id = (select app.betrieb()) and (select app.angemeldet()))
  or ((select app.ist_plattform()) and app.support_liest(company_id))
);
