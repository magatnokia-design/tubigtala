// The Wi-Fi setup page the station serves on its own setup network (wifisetup.cpp).
// One self-contained page: no outside files, because the phone has no internet while it is on
// the setup network. Talks to the station with /scan, /connect and /status (JSON).
#pragma once
#include <Arduino.h>

static const char SETUP_PAGE[] PROGMEM = R"HTML(<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TubigTala Station - Wi-Fi setup</title>
<style>
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#F2F7FB;color:#0B2540}
header{background:#0079CE;color:#fff;padding:22px 18px 30px;border-radius:0 0 22px 22px}
header h1{margin:0;font-size:21px}header p{margin:4px 0 0;opacity:.9;font-size:14px}
main{max-width:460px;margin:-14px auto 0;padding:0 14px 24px}
.card{background:#fff;border:1px solid #D7E3EE;border-radius:16px;padding:16px;margin-bottom:12px}
h2{font-size:16px;margin:0 0 4px}.m{color:#55697A;font-size:13px;line-height:1.4;margin:4px 0}
ul{list-style:none;margin:10px 0 0;padding:0;max-height:240px;overflow:auto}
li{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 6px;border-top:1px solid #E6EEF5;cursor:pointer;font-size:15px}
li:active,li.sel{background:#E8F3FC}li span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
label{display:block;font-size:13px;color:#55697A;margin:14px 0 5px}
input[type=text],input[type=password]{width:100%;font-size:16px;padding:12px;border:1px solid #C9D8E5;border-radius:10px}
.row{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:14px;color:#55697A}
button{width:100%;margin-top:16px;font-size:16px;font-weight:600;padding:14px;border:0;border-radius:999px;background:#0079CE;color:#fff}
button:disabled{opacity:.5}
#msg{display:none}.ok{color:#0A7D3B}.err{color:#B3261E}
</style></head><body>
<header><h1>TubigTala Station</h1><p>Wi-Fi setup</p></header>
<main>
<div class="card" id="form">
  <h2>Choose the Wi-Fi for your station</h2>
  <p class="m">A 2.4 GHz network with internet. Your phone may say this setup network has no internet - that is normal, stay on it.</p>
  <ul id="nets"><li class="m">Looking for networks...</li></ul>
  <label for="s">Network name</label>
  <input type="text" id="s" maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false">
  <label for="p">Password</label>
  <input type="password" id="p" maxlength="63" autocomplete="off">
  <label class="row"><input type="checkbox" id="show"> Show password</label>
  <button id="go">Connect</button>
</div>
<div class="card" id="msg"></div>
<p class="m" style="text-align:center">TubigTala is a student IoT prototype.</p>
</main>
<script>
var $=function(i){return document.getElementById(i)},timer=null;
$('show').onchange=function(){$('p').type=this.checked?'text':'password'};
function bars(r){return r>-60?'strong':r>-72?'good':r>-82?'weak':'very weak'}
function say(html,cls){var m=$('msg');m.style.display='block';m.className='card '+(cls||'');m.innerHTML=html;return m}
fetch('/scan').then(function(r){return r.json()}).then(function(list){
  var ul=$('nets');ul.innerHTML='';
  if(!list.length){ul.innerHTML='<li class="m">No networks found - type the name below.</li>';return}
  list.forEach(function(n){
    var li=document.createElement('li'),a=document.createElement('span'),b=document.createElement('span');
    a.textContent=n.ssid;b.className='m';b.textContent=(n.open?'open':'locked')+' - '+bars(n.rssi);
    li.appendChild(a);li.appendChild(b);
    li.onclick=function(){var s=document.querySelectorAll('li.sel');for(var i=0;i<s.length;i++)s[i].className='';
      li.className='sel';$('s').value=n.ssid;$('p').value='';if(!n.open)$('p').focus()};
    ul.appendChild(li)});
}).catch(function(){$('nets').innerHTML='<li class="m">Could not list networks - type the name below.</li>'});
$('go').onclick=function(){
  var s=$('s').value.trim(),p=$('p').value;
  if(!s){say('<b class="err">Choose or type the network name.</b>');return}
  if(p&&p.length<8){say('<b class="err">A Wi-Fi password has at least 8 characters.</b>');return}
  $('go').disabled=true;
  say('Connecting to <b></b>... this takes up to 20 seconds.').querySelector('b').textContent=s;
  var body='ssid='+encodeURIComponent(s)+'&pass='+encodeURIComponent(p);
  fetch('/connect',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:body})
    .then(function(r){if(!r.ok)throw 0;timer=setInterval(poll,1500)})
    .catch(function(){$('go').disabled=false;say('<b class="err">The station did not answer.</b> Check that your phone is still on the setup network and try again.')});
};
function poll(){fetch('/status',{cache:'no-store'}).then(function(r){return r.json()}).then(function(st){
  if(st.state==='connected'){clearInterval(timer);$('form').style.display='none';
    var m=say('<h2 class="ok">Connected!</h2><p class="m">Your station is online on <b></b> and starts sending readings. This setup network closes in a few seconds.</p>'+
      '<p class="m"><b>Next:</b> reconnect your phone to your usual Wi-Fi, open the TubigTala app and scan the QR sticker on the station to add it (if you have not yet).</p>');
    m.querySelector('b').textContent=st.ssid}
  else if(st.state==='failed'){clearInterval(timer);$('go').disabled=false;
    var f=say('<b class="err">Could not connect to <span></span>:</b> <span></span>. Check and try again.');
    var sp=f.querySelectorAll('span');sp[0].textContent=st.ssid;sp[1].textContent=st.reason}
}).catch(function(){})}
</script>
</body></html>)HTML";
