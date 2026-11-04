<?php
declare(strict_types=1);
require '/src/senklot-intern/kontakt.php';
use SenklotWeb\Speicher;
use function SenklotWeb\{validieren,verarbeiten,mailText,bereit};
if(($argv[1]??'')==='worker'){
 $s=new Speicher($argv[2],1000);
 echo $argv[3]==='rate' ? ($s->rate('192.0.2.8')?'allowed':'denied') : $s->status('parallel','fingerprint',true);exit;
}
$tests=0;
function check(bool $b,string $label): void { global $tests; if (!$b) throw new RuntimeException($label); $tests++; echo "OK $label\n"; }
function payload(): array { return ['name'=>'Anna Beispiel','firma'=>'Testbetrieb GmbH','email'=>'anna@example.org','telefon'=>'','nachricht'=>'Bitte um eine Demo.','tarif'=>'team','zahlung'=>'jaehrlich','einrichtung'=>true,'nutzer'=>'8','website'=>'','token'=>'valid-token','requestId'=>'ac85a431-3dd1-4e02-82d9-393a760c4741','spamschutzZugestimmt'=>true]; }
function store(int $now=100000): Speicher { return new Speicher('/tmp/senklot-test-'.bin2hex(random_bytes(8)),$now); }
$c=['origins'=>['https://senklot.at']];$headers=['origin'=>'https://senklot.at','content-type'=>'application/json'];
$verified=0;$sent=0;
$verify=function($token,$ip) use (&$verified) { $verified++;return ['success'=>true,'hostname'=>'senklot.at','action'=>'contact']; };
$send=function($d,$text) use (&$sent) { $sent++; check(str_contains($text,'1.933,20 €') && str_contains($text,'399,00 €'),'Preise aus serverseitigem Tarif, Einrichtung unverändert'); };
$call=function($p,$s,$v=null,$snd=null,$h=null,$m='POST') use($c,$headers,$verify,$send) {return verarbeiten($m,$h??$headers,is_string($p)?$p:json_encode($p),'192.0.2.5',$c,$v??$verify,$snd??$send,$s);};
check(isset(validieren(payload())['data']),'Gültige Eingaben');
foreach (['name'=>"Anna\r\nBcc: fremd@example.org",'email'=>'bad','firma'=>['bad'],'einrichtung'=>'ja','nutzer'=>true,'tarif'=>'gratis','zahlung'=>'woche','website'=>'bot','spamschutzZugestimmt'=>false,'requestId'=>'invalid','nachricht'=>str_repeat('x',3001),'token'=>str_repeat('x',2049)] as $key=>$bad) { $p=payload();$p[$key]=$bad;check(isset(validieren($p)['errors']),"Ungültiges Feld $key abgelehnt"); }
check(isset(validieren(null)['errors']) && isset(validieren([])['errors']),'JSON-Grundtypen abgefangen');
foreach ([['POST',['origin'=>'https://evil.example','content-type'=>'application/json'],payload(),403],['GET',$headers,payload(),405],['POST',['origin'=>'https://senklot.at','content-type'=>'text/plain'],payload(),415],['POST',$headers,str_repeat('x',12001),413],['POST',$headers,'{',400]] as [$m,$h,$p,$expected]) check($call($p,store(),h:$h,m:$m)[0]===$expected,"HTTP-Schutz $expected");
foreach ([['success'=>false],['success'=>true,'hostname'=>'evil.example','action'=>'contact'],['success'=>true,'hostname'=>'senklot.at','action'=>'login']] as $response) check($call(payload(),store(),fn()=> $response)[0]===403,'Turnstile Ergebnis / Host / Aktion geprüft');
check($call(payload(),store(),function(){throw new RuntimeException('offline');})[0]===503,'Prüfungsfehler sicher abgefangen');
check($sent===0,'Kein Versand bei abgelehnten Anfragen');
$p=payload();$p['token']='';check($call($p,store())[0]===403,'Ohne Token kein Versand');
$s=store();$response=$call(payload(),$s);check($response[0]===200 && $response[1]['code']==='ACCEPTED' && $sent===1,'Bestätigter Versand');
$previous=$verified;$p=payload();$p['token']='';check($call($p,$s)[0]===200 && $sent===1 && $verified===$previous,'Wiederholung ohne zweite E-Mail');
$p['nachricht']='Geänderte Anfrage';check($call($p,$s)[0]===409 && $sent===1,'Gleiche ID mit anderen Daten gesperrt');
$s=store();check($call(payload(),$s,snd:function(){throw new RuntimeException('unclear SMTP');})[0]===502,'Unklarer SMTP-Versand niemals als Erfolg gemeldet');
check($call(payload(),$s)[0]===409 && $sent===1,'Unklarer Versand wird nicht wiederholt');
$dir='/tmp/senklot-test-'.bin2hex(random_bytes(8));$s=new Speicher($dir,1000);
for($i=0;$i<8;$i++)check($s->rate('192.0.2.3'),'Rate innerhalb Grenze');
check(!(new Speicher($dir,1001))->rate('192.0.2.3'),'Rate prozessübergreifend begrenzt');
check((new Speicher($dir,1901))->rate('192.0.2.3'),'Rate nach Ablauf freigegeben');
$d=validieren(payload())['data'];$fp=$s->fingerprint($d);check($s->status($d['requestId'],$fp,true)==='reserved','Anfrage atomar reserviert');
check((new Speicher($dir,1002))->status($d['requestId'],$fp,true)==='sending','Andere PHP-Instanz erkennt Reservierung');
$s->setzen($d['requestId'],'accepted');check((new Speicher($dir,1003))->status($d['requestId'],$fp)==='accepted','Versandstatus persistent');
check((new Speicher($dir,200000))->status($d['requestId'],$fp)==='new','Abgelaufene Anfrage bereinigt');
$state=file_get_contents($dir.'/zustand.json');check(!str_contains($state,'192.0.2.3') && !str_contains($state,'anna@example.org') && !str_contains($state,'Bitte um eine Demo'),'Keine Klartext-IP / Nachricht / E-Mail im Speicher');
file_put_contents($dir.'/zustand.json','kaputt');$failed=false;try{$s->rate('ip');}catch(Throwable){$failed=true;}check($failed,'Beschädigter Speicher blockiert Versand');
check(!bereit([]),'Ohne Konfiguration deaktiviert');
$cfg=require '/src/senklot-intern/config.example.php';check(!bereit($cfg),'Beispielkonfiguration deaktiviert');
$cfg['enabled']=true;$cfg['legal_ready']=true;$cfg['smtp']['username']='u';$cfg['smtp']['password']='p';$cfg['turnstile']=['site_key'=>'real-public','secret_key'=>'real-secret'];check(bereit($cfg),'Vollständige freigegebene Konfiguration erkannt');
$cfg['legal_ready']=false;check(!bereit($cfg),'Ohne rechtliche Freigabe deaktiviert');$cfg['legal_ready']=true;$cfg['turnstile']['site_key']='1x00000000000000000000AA';check(!bereit($cfg),'Öffentlicher Turnstile-Testschlüssel im Produktivbetrieb abgelehnt');
$tarife=json_decode(file_get_contents('/src/senklot-intern/tarife.json'),true);check(count($tarife)===3 && $tarife['team']['monatCent']===17900,'Drei konsistente Tarife');
foreach ([['starter','129,00 €','1.393,20 €','199,00 €'],['team','179,00 €','1.933,20 €','399,00 €'],['betrieb','249,00 €','2.689,20 €','699,00 €']] as [$id,$monat,$jahr,$setup]) {
 foreach (['monatlich'=>$monat,'jaehrlich'=>$jahr] as $wahl=>$betrag) {
  $p=payload();$p['tarif']=$id;$p['zahlung']=$wahl;$text=mailText(validieren($p)['data']);
  check(str_contains($text,$betrag) && str_contains($text,$setup) && str_contains($text,'Einführungspreise für Pilotbetriebe'),'Preis und Angebotskontext '.$id.' '.$wahl);
 }
}
foreach(['starter','team','betrieb','offen'] as $id){
 $p=payload();$p['tarif']=$id;$p['einrichtung']=false;$text=mailText(validieren($p)['data']);
 check(str_contains($text,'Einrichtung: nicht angefragt') && !str_contains($text,'Einrichtung angefragt:'),'Ohne Buchung keine Einrichtung '.$id);
 $p['einrichtung']=true;$text=mailText(validieren($p)['data']);check(str_contains($text,'Optionale Einrichtung angefragt:') && str_contains($text,'12 Monate garantiert'),'Optionale Einrichtung und Preisbindung '.$id);
}
$p=payload();unset($p['einrichtung']);check(validieren($p)['data']['einrichtung']===false,'Fehlende Einrichtungsauswahl ist keine Buchung');
foreach(['reserve','rate'] as $action){
 $dir='/tmp/senklot-parallel-'.bin2hex(random_bytes(8));$workers=[];
 for($i=0;$i<16;$i++){$pipes=[];$proc=proc_open([PHP_BINARY,__FILE__,'worker',$dir,$action],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$workers[]=[$proc,$pipes];}
 $results=[];foreach($workers as [$proc,$pipes]){$results[]=stream_get_contents($pipes[1]);$error=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($proc)!==0||$error!=='')throw new RuntimeException('Worker fehlgeschlagen');}
 check(count(array_filter($results,fn($r)=>$r===($action==='rate'?'allowed':'reserved')))===($action==='rate'?8:1),'16 parallele PHP-Prozesse: '.$action);
}
echo json_encode(['assertions'=>$tests,'failed'=>0])."\n";
