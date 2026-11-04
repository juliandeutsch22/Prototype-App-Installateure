<?php
declare(strict_types=1);
require '/src/senklot-intern/kontakt.php';
use SenklotWeb\Speicher;
use function SenklotWeb\{schutzmodus,bereit,verarbeiten,validieren};
$n=0;
function ok(bool $v,string $label):void{global $n;if(!$v)throw new RuntimeException($label);$n++;echo "OK $label\n";}
function dirNeu():string{return '/tmp/senklot-local-test-'.bin2hex(random_bytes(8));}
function daten(string $token):array{return ['name'=>'Anna Beispiel','firma'=>'Testbetrieb','email'=>'anna@example.org','telefon'=>'','nachricht'=>'Bitte um eine Demo.','tarif'=>'team','zahlung'=>'jaehrlich','einrichtung'=>false,'nutzer'=>'8','website'=>'','requestId'=>'ac85a431-3dd1-4e02-82d9-393a760c4741','token'=>$token,'spamschutzZugestimmt'=>false];}
if(($argv[1]??'')==='worker'){echo (new Speicher($argv[2],100003))->lokalPruefen($argv[3],'192.0.2.5','https://senklot.at');exit;}
ok(schutzmodus([])==='local','Ohne externe Schlüssel lokaler Schutz');
ok(schutzmodus(['turnstile'=>['site_key'=>'key']])==='turnstile','Unvollständige alte Turnstile-Konfiguration bleibt streng');
ok(schutzmodus(['turnstile'=>['secret_key'=>'key']])==='turnstile','Alter privater Schlüssel erzwingt Turnstile-Modus');
ok(schutzmodus(['turnstile'=>['site_key'=>'0']])==='turnstile','Auch ungültiger eingetragener Schlüssel wird nicht stillschweigend herabgestuft');
ok(schutzmodus(['turnstile'=>'bad'])==='invalid','Fehlerhafte alte Konfiguration sperrt statt herabzustufen');
ok(schutzmodus(['spam_protection'=>'local','turnstile'=>['site_key'=>'key']])==='local','Explizite lokale Auswahl');
ok(schutzmodus(['spam_protection'=>'disabled'])==='invalid','Unbekannter Modus kann Schutz nicht abschalten');
$c=require '/src/senklot-intern/config.example.php';$c['enabled']=true;$c['legal_ready']=true;$c['smtp']['username']='u';$c['smtp']['password']='not-real';
ok(bereit($c),'Lokaler Versand benötigt keine Cloudflare-Schlüssel');$c['spam_protection']='turnstile';ok(!bereit($c),'Turnstile braucht beide Schlüssel');$c['spam_protection']='typo';ok(!bereit($c),'Ungültiger Modus sperrt Formular');$c['spam_protection']='local';$c['legal_ready']=false;ok(!bereit($c),'Rechtliche Freigabe bleibt erforderlich');$c['legal_ready']=true;
$dir=dirNeu();$s=new Speicher($dir,100000);$token=$s->lokalesToken('192.0.2.5','https://senklot.at');
ok(!str_contains($token,'192.0.2.5'),'Token enthält keine Klartext-IP');
ok($s->lokalPruefen($token,'192.0.2.5','https://senklot.at')==='early','Mindestzeit wird serverseitig geprüft');
ok((new Speicher($dir,100001))->lokalPruefen($token,'192.0.2.5','https://senklot.at')==='early','Zu schnelle Wiederholung bleibt gesperrt');
ok((new Speicher($dir,100003))->lokalPruefen($token,'192.0.2.6','https://senklot.at')==='invalid','Token an Verbindung gebunden');
ok((new Speicher($dir,100003))->lokalPruefen($token,'192.0.2.5','https://evil.example')==='invalid','Token an Website gebunden');
ok((new Speicher($dir,100003))->lokalPruefen(substr($token,0,-1).($token[-1]==='a'?'b':'a'),'192.0.2.5','https://senklot.at')==='invalid','Manipulierte Signatur abgelehnt');
ok((new Speicher(dirNeu(),100003))->lokalPruefen($token,'192.0.2.5','https://senklot.at')==='invalid','Fremder Installationsschlüssel abgelehnt');
ok((new Speicher($dir,100003))->lokalPruefen($token,'192.0.2.5','https://senklot.at')==='valid','Gültiges Token nach Wartezeit akzeptiert');
ok((new Speicher($dir,100004))->lokalPruefen($token,'192.0.2.5','https://senklot.at')==='used','Token prozessübergreifend nur einmal gültig');
$t=$s->lokalesToken('192.0.2.5','https://senklot.at');ok((new Speicher($dir,101800))->lokalPruefen($t,'192.0.2.5','https://senklot.at')==='expired','Ablauf nach 30 Minuten');
$t=(new Speicher($dir,100100))->lokalesToken('192.0.2.5','https://senklot.at');ok($s->lokalPruefen($t,'192.0.2.5','https://senklot.at')==='expired','Zukünftiges Token abgelehnt');
foreach(['','x',str_repeat('x',2048),'abc.def']as$bad)ok($s->lokalPruefen($bad,'192.0.2.5','https://senklot.at')==='invalid','Ungültiges Format');
// Nur HMACs und Ablaufdaten werden gespeichert, kein unbearbeitetes Token.
$state=file_get_contents($dir.'/zustand.json');ok(!str_contains($state,$token)&&!str_contains($state,'192.0.2.5'),'Token-Speicher enthält keine Klartext-IP oder Roh-Tokens');
$dir=dirNeu();$s=new Speicher($dir,100000);$t=$s->lokalesToken('192.0.2.5','https://senklot.at');$workers=[];
for($i=0;$i<16;$i++){$pipes=[];$proc=proc_open([PHP_BINARY,__FILE__,'worker',$dir,$t],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$workers[]=[$proc,$pipes];}
$results=[];foreach($workers as[$proc,$pipes]){$results[]=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($proc)!==0||$err!=='')throw new RuntimeException('Worker fehlgeschlagen');}
ok(count(array_filter($results,fn($v)=>$v==='valid'))===1 && count(array_filter($results,fn($v)=>$v==='used'))===15,'16 parallele Prozesse verbrauchen Token genau einmal');
$s=new Speicher(dirNeu(),100000);for($i=0;$i<60;$i++)if(!$s->tokenRate('ip'))throw new RuntimeException('Token-Rate zu früh gesperrt');ok(!$s->tokenRate('ip'),'Token-Erzeugung begrenzt');ok($s->rate('ip'),'Token- und Versandlimit getrennt');
$sent=[];$verify=function(){throw new RuntimeException('Externer Dienst darf lokal nicht aufgerufen werden');};$send=function($d,$text)use(&$sent){$sent[]=$text;};
$headers=['origin'=>'https://senklot.at','content-type'=>'application/json'];
$dir=dirNeu();$s=new Speicher($dir,100000);$t=$s->lokalesToken('192.0.2.5','https://senklot.at');$d=daten($t);
$call=function($d,$now,$v=null,$snd=null)use(&$dir,$headers,$c,$verify,$send){return verarbeiten('POST',$headers,json_encode($d),'192.0.2.5',$c,$v??$verify,$snd??$send,new Speicher($dir,$now));};
ok($call($d,100000)[0]===429 && count($sent)===0,'Zu schneller Versand sendet keine E-Mail');
$r=$call($d,100003);ok($r[0]===200&&$r[1]['code']==='ACCEPTED'&&count($sent)===1,'Lokaler Versand ohne Cloudflare und ohne externe Einwilligung');
ok(str_contains($sent[0],'Lokaler Formularschutz')&&!str_contains($sent[0],'Externe Sicherheitsprüfung wurde'),'Mail benennt lokalen Schutz korrekt');
ok(str_contains($sent[0],'keine Einrichtungsgebühr')&&str_contains($sent[0],'1.933,20 €'),'Preise und freiwillige Einrichtung bleiben erhalten');
$d['token']='';ok($call($d,100004)[0]===200&&count($sent)===1,'Bestätigte Wiederholung benötigt kein neues Token und sendet nicht erneut');
$d['token']=$t;$d['requestId']='bc85a431-3dd1-4e02-82d9-393a760c4741';ok($call($d,100004)[0]===403&&count($sent)===1,'Gleiches Token für zweite Anfrage gesperrt');
$d['token']='forged';ok($call($d,100004)[0]===403&&count($sent)===1,'Gefälschtes Token ohne Versand');
$d['website']='bot';ok($call($d,100004)[0]===422&&count($sent)===1,'Honeypot bleibt aktiv');
$dir=dirNeu();$s=new Speicher($dir,100000);$d=daten($s->lokalesToken('192.0.2.5','https://senklot.at'));
$fail=function(){throw new RuntimeException('SMTP unklar');};
ok($call($d,100003,null,$fail)[0]===502,'Unklarer lokaler Versand wird nicht als Erfolg gemeldet');
ok($call($d,100004)[0]===409,'Unklarer lokaler Versand wird nicht wiederholt');
// Bestehende Zustandsdateien ohne Token-Feld bleiben verwendbar.
$dir=dirNeu();$s=new Speicher($dir,100000);file_put_contents($dir.'/zustand.json',json_encode(['rate'=>[],'requests'=>[]]));ok($s->rate('ip'),'Bisheriger Speicher bleibt kompatibel');
echo json_encode(['assertions'=>$n,'failed'=>0])."\n";
