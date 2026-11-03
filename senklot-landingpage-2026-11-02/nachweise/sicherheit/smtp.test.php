<?php
require '/src/senklot-intern/kontakt.php';
$c=['smtp'=>['host'=>'localhost','port'=>5283,'security'=>'ssl','username'=>'local-test','password'=>'not-a-real-password','from'=>'office@senklot.at','from_name'=>'Senklot']];
$d=['email'=>'reply@example.org','requestId'=>'ac85a431-3dd1-4e02-82d9-393a760c4741'];
$success=false;try{\SenklotWeb\smtp($c,$d,'Lokaler Test; keine echte Zustellung.');$success=true;}catch(Throwable $e){if($argv[1]!=='reject')throw $e;}
if($success!==($argv[1]==='accept'))throw new RuntimeException('TLS result differs from expectation');
echo $success ? "OK certificate trusted, message accepted by local SMTP\n" : "OK untrusted TLS certificate rejected\n";
