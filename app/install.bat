@echo off
chcp 65001 >nul
rem 로또 분석 — 한 번만 실행하는 설치 파일. 두 번 누르면 전부 알아서 합니다.
rem Node.js (없거나 오래되면 설치), 패키지 설치, 데이터 생성, 바탕화면 아이콘, 앱 실행.
rem 괄호 블록 대신 goto 를 씁니다 : PATH 안의 "(x86)" 이 블록을 깨뜨리기 때문입니다.
cd /d "%~dp0.."
rem ZIP 으로 받은 파일에 붙는 「인터넷에서 받음」 표시를 지웁니다 — 아이콘을 누를 때마다 경고가 뜨지 않게.
powershell -NoProfile -Command "Get-ChildItem -LiteralPath app -File | Unblock-File" >nul 2>&1

echo.
echo  로또 분석 설치
echo  -----------------------------------

call :node_ok
if not errorlevel 1 goto node_ready

echo  [0/3] Node.js 설치 중 ... 처음 한 번만, 1~3분 걸립니다.
echo        관리자 권한을 묻는 창이 뜨면 [예]를 누르세요.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0node-install.ps1"
set "PATH=%ProgramFiles%\nodejs;%PATH%"
call :node_ok
if not errorlevel 1 goto node_ready

echo.
echo  Node.js 를 자동으로 설치하지 못했습니다.
echo  열리는 페이지에서 LTS 버전을 설치한 뒤, 이 파일을 다시 두 번 누르세요.
start "" https://nodejs.org/ko/download
pause
exit /b 1

:node_ready
for /f "delims=" %%v in ('node -v') do echo  [0/3] Node.js %%v - 준비됨

rem 프로젝트 자체는 의존성이 없습니다 (node:sqlite, node:http) — web 만 설치.
if exist web\node_modules goto web_ready
echo  [1/3] 화면 패키지 설치 ...
call npm --prefix web install || goto fail
goto web_done
:web_ready
echo  [1/3] 화면 패키지 - 이미 설치됨
:web_done

if exist web\public\data\meta.json goto data_ready
echo  [2/3] 데이터 파일 생성 ...
call npm run build:data || goto fail
goto data_done
:data_ready
echo  [2/3] 데이터 파일 - 이미 있음
:data_done

echo  [3/3] 바탕화면 아이콘 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shortcuts.ps1" || goto fail

echo.
echo  완료. 로또 분석을 엽니다 — 다음부터는 바탕화면의 [로또 분석] 아이콘을 누르세요.
echo.
start "" wscript "%~dp0start.vbs"
timeout /t 5 >nul
exit /b 0

rem Node.js 가 있고 22.5 이상이면 0, 아니면 1.
:node_ok
where node >nul 2>&1 || exit /b 1
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=5)?0:1)" >nul 2>&1
exit /b %errorlevel%

:fail
echo.
echo  설치 중 오류가 났습니다. 위의 메시지를 확인하세요.
pause
exit /b 1
