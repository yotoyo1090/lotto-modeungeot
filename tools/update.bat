@echo off
REM Mise à jour hebdomadaire — à lancer par le Planificateur de tâches.
REM
REM Trois étapes, dans cet ordre : récupérer les nouveaux tirages des deux
REM produits, puis régénérer les fichiers du site. Si le crawl échoue, la
REM régénération n'a pas lieu : mieux vaut un site à jour de la semaine
REM dernière qu'un site reconstruit à partir de données à moitié écrites.
REM
REM Pour l'installer (une seule fois, dans une invite ouverte en
REM administrateur) — chaque dimanche à 9 h :
REM
REM   schtasks /create /tn "lotto" /tr "C:\chemin\vers\lotto-js\tools\update.bat" /sc weekly /d SUN /st 09:00
REM
REM Pour vérifier ce qu'elle a fait :  npm run doctor

cd /d "%~dp0.."

echo [%date% %time%] mise a jour  >> data\update.log

call npm run crawl -- since               >> data\update.log 2>&1
if errorlevel 1 goto failed

call npm run crawl -- since --product pension >> data\update.log 2>&1
if errorlevel 1 goto failed

call npm run build:data                   >> data\update.log 2>&1
if errorlevel 1 goto failed

echo [%date% %time%] ok                   >> data\update.log
exit /b 0

:failed
echo [%date% %time%] ECHEC - voir ci-dessus >> data\update.log
exit /b 1
