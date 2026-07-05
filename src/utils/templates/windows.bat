@echo off
@chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

set IP=#{address}
set MASK=#{netmask}
set GW=#{gateway}
set DNS1=#{dns1}
set DNS2=#{dns2}

set "IFACE="

for /f "tokens=1,2,3,* delims= " %%A in ('netsh interface show interface ^| findstr /R /C:"Connected"') do (
    set "IFACE=%%D"
    goto :found
)

:found
if not defined IFACE (
    echo No connected interface found.
    exit /b 1
)

netsh interface ip set address name="!IFACE!" static %IP% %MASK% %GW% 1 >nul 2>&1
netsh interface ip set dns name="!IFACE!" static %DNS1% primary >nul 2>&1
netsh interface ip add dns name="!IFACE!" %DNS2% index=2 >nul 2>&1

exit /b 0
