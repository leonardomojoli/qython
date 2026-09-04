@echo off
REM Inicia o ADB Watchdog em background
REM O watchdog mantém a conexão ADB ativa e reconecta automaticamente se cair

echo Iniciando Qython ADB Watchdog...
echo.
echo O watchdog irá:
echo   - Verificar a conexão a cada 30 segundos
echo   - Enviar ping a cada 60 segundos para manter conexão viva
echo   - Reconectar automaticamente se a conexão cair
echo.
echo Log: %~dp0adb_watchdog.log
echo.
echo Pressione Ctrl+C para parar ou feche esta janela.
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0adb_watchdog.ps1"
