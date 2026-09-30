@echo off
chcp 65001 >nul
rem 로또 분석 — 한 번만 실행하는 설치 파일.
rem Node 확인, 패키지 설치, 데이터 생성, 바탕화면 아이콘 두 개.
cd /d "%~dp0.."

echo.
echo  로또 분석 설치
echo  -----------------------------------

where node >nul 2>&1
if errorlevel 1 (
  echo  Node.js 가 없습니다. https://nodejs.org 에서 설치한 뒤 다시 실행하세요.
  pause
  exit /b 1
)

rem 프로젝트 자체는 의존성이 없습니다 (node:sqlite, node:http) — web 만 설치.
if not exist web\node_modules (
  echo  [1/3] 화면 패키지 설치 ...
  call npm --prefix web install || goto fail
) else echo  [1/3] 화면 패키지 - 이미 설치됨

if not exist web\public\data\meta.json (
  echo  [2/3] 데이터 파일 생성 ...
  call npm run build:data || goto fail
) else echo  [2/3] 데이터 파일 - 이미 있음

echo  [3/3] 바탕화면 아이콘 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0shortcuts.ps1" || goto fail

echo.
echo  완료. 바탕화면의 [로또 분석] 아이콘을 두 번 누르세요.
echo.
pause
exit /b 0

:fail
echo.
echo  설치 중 오류가 났습니다. 위의 메시지를 확인하세요.
pause
exit /b 1
