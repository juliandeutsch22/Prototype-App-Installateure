<?php
// Isolierter TLS-SMTP-Testserver; nimmt nur lokal an und leitet niemals weiter.
$ctx=stream_context_create(['ssl'=>['local_cert'=>'/fixtures/test.crt','local_pk'=>'/fixtures/test.key','verify_peer'=>false]]);
$server=stream_socket_server('tls://127.0.0.1:465',$errno,$err,STREAM_SERVER_BIND|STREAM_SERVER_LISTEN,$ctx);
if(!$server)throw new RuntimeException($err);
$messages=[];file_put_contents('/tmp/local-smtp.json','[]');
while(count($messages)<2){
 $c=stream_socket_accept($server,45);if(!$c)throw new RuntimeException('Keine SMTP-Verbindung');stream_set_timeout($c,15);fwrite($c,"220 localhost test SMTP\r\n");$auth=0;$msg=['recipients'=>[]];
 while(($line=fgets($c))!==false){$line=rtrim($line,"\r\n");$cmd=strtoupper(explode(' ',$line,2)[0]);
  if($auth){if($auth===1){fwrite($c,"334 UGFzc3dvcmQ6\r\n");$auth=2;}else{fwrite($c,"235 Authentication successful\r\n");$auth=0;}}
  elseif(in_array($cmd,['EHLO','HELO']))fwrite($c,"250-localhost\r\n250 AUTH LOGIN\r\n");
  elseif($cmd==='AUTH'){fwrite($c,"334 VXNlcm5hbWU6\r\n");$auth=1;}
  elseif($cmd==='MAIL'){$msg['from']=$line;fwrite($c,"250 OK\r\n");}
  elseif($cmd==='RCPT'){$msg['recipients'][]=$line;fwrite($c,"250 OK\r\n");}
  elseif($cmd==='DATA'){
   fwrite($c,"354 End with dot\r\n");$data='';while(($l=fgets($c))!==false&&$l!==".\r\n")$data.=$l;
   $msg['data']=$data;$messages[]=$msg;file_put_contents('/tmp/local-smtp.json',json_encode($messages));fwrite($c,"250 accepted locally\r\n");
  }elseif($cmd==='QUIT'){fwrite($c,"221 Bye\r\n");break;}else fwrite($c,"250 OK\r\n");
 }fclose($c);
}
fclose($server);
