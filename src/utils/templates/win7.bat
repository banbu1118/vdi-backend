@echo off
setlocal

set IP=#{address}
set MASK=#{netmask}
set GW=#{gateway}
set DNS1=#{dns1}
set DNS2=#{dns2}


for /f "tokens=2 delims==" %%A in ('
  wmic nic where "NetEnabled=true" get NetConnectionID /value
') do (
    if not "%%A"=="" set IFACE=%%A
)

if not defined IFACE (
    echo No enabled interface found
    exit /b 1
)

echo Setting IP on !IFACE!

netsh interface ip set address name="%IFACE%" static %IP% %MASK% %GW% 1
netsh interface ip set dns name="%IFACE%" static %DNS1% primary >nul 2>&1
netsh interface ip add dns name="%IFACE%" %DNS2% index=2 >nul 2>&1

echo DONE
pause
