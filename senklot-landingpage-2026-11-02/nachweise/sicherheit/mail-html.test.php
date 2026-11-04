<?php
require '/src/senklot-intern/kontakt.php';
use function SenklotWeb\{mailHtml,mailText,validieren};
$n=0;function ok($v,$label){global $n;if(!$v)throw new RuntimeException($label);$n++;echo "OK $label\n";}
$raw=['name'=>'Anna <script>alert(1)</script>','firma'=>'Betrieb <b>& Co</b>','email'=>'anna@example.org','telefon'=>'','nachricht'=>"<img src=x onerror=alert(1)>\nZweite Zeile",'tarif'=>'team','zahlung'=>'jaehrlich','einrichtung'=>true,'nutzer'=>'8','website'=>'','requestId'=>'ac85a431-3dd1-4e02-82d9-393a760c4741','token'=>''];
$d=validieren($raw)['data'];$html=mailHtml($d);
ok(str_contains($html,'Anna &lt;script&gt;'),'Name maskiert');ok(!str_contains($html,'<script>')&&!str_contains($html,'<img src=x'),'Kein aktives HTML aus Eingaben');ok(str_contains($html,'Betrieb &lt;b&gt;&amp; Co&lt;/b&gt;'),'Betrieb maskiert');ok(str_contains($html,'&lt;img src=x onerror=alert(1)&gt;')&&str_contains($html,'Zweite Zeile'),'Nachricht als Text mit Zeilenumbruch');
ok(str_contains($html,'1.933,20 €')&&str_contains($html,'399,00 €'),'Serverseitige Jahres- und Einrichtungspreise');ok(str_contains($html,'12 Monate garantiert'),'Preisbindung bleibt enthalten');ok(str_contains($html,'cid:senklot-logo'),'Logo eingebettet statt extern geladen');ok(!preg_match('~<img[^>]+src=["\']https?://~i',$html),'Keine externen Bilder');ok(!str_contains($html,'<script')&&!str_contains($html,'<link'),'Keine Skripte oder externen Schriftarten');ok(!str_contains($html,'{{'),'Alle Platzhalter ersetzt');
ok(str_contains($html,'mailto:anna%40example.org'),'Sicherer Antwortlink');ok(str_contains(mailText($d),'Betrieb <b>& Co</b>'),'Klartextdarstellung bleibt unverändert');
$d['einrichtung']=false;$html=mailHtml($d);ok(str_contains($html,'Keine Einrichtungsgebühr')&&!str_contains($html,'399,00 €'),'Kein Einrichtungspreis ohne Auswahl');
$html=mailHtml($d,false);ok(!str_contains($html,'cid:')&&str_contains($html,'Senklot'),'Textmarke als Fallback ohne Bild');
$d['tarif']='offen';$html=mailHtml($d);ok(str_contains($html,'Tarif noch offen')&&!str_contains($html,'1.933,20 €'),'Keine erfundenen Preise bei allgemeiner Anfrage');
echo json_encode(['assertions'=>$n,'failed'=>0])."\n";
