<?php
require '/src/senklot-intern/kontakt.php';
$raw=['name'=>'Anna Beispiel','firma'=>'Beispiel Installation GmbH','email'=>'anna@example.org','telefon'=>'+43 660 123456','nachricht'=>"Wir sind ein Team mit acht Mitarbeitern und möchten unsere Planung und Zeiterfassung zusammenführen.\n\nBitte um einen Termin für eine persönliche Demo.",'tarif'=>'team','zahlung'=>'jaehrlich','einrichtung'=>true,'nutzer'=>'8','website'=>'','requestId'=>'ac85a431-3dd1-4e02-82d9-393a760c4741','token'=>''];
$d=\SenklotWeb\validieren($raw)['data'];echo str_replace('cid:senklot-logo','data:image/png;base64,'.base64_encode(file_get_contents('/src/senklot-intern/mail-logo.png')),\SenklotWeb\mailHtml($d));
