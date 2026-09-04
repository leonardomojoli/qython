@echo off
REM Qython - Android Development Device Connection
REM Device: <seu aparelho Android> (<MODELO>) - Android 13

set DEVICE_IP=<IP_LOCAL_DO_APARELHO>
set DEVICE_PORT=%1

if "%DEVICE_PORT%"=="" (
    echo.
    echo Uso: adb_connect.bat [porta]
    echo.
    echo A porta pode ser encontrada em:
    echo   Configuracoes ^> Opcoes do desenvolvedor ^> Depuracao sem fio
    echo.
    echo Exemplo: adb_connect.bat 41335
    echo.

    REM Tenta conectar na ultima porta conhecida
    if exist "%~dp0.last_adb_port" (
        set /p DEVICE_PORT=<"%~dp0.last_adb_port"
        echo Tentando ultima porta conhecida: %DEVICE_PORT%
    ) else (
        exit /b 1
    )
)

echo Conectando a %DEVICE_IP%:%DEVICE_PORT%...
adb connect %DEVICE_IP%:%DEVICE_PORT%

REM Salva a porta para uso futuro
echo %DEVICE_PORT%> "%~dp0.last_adb_port"

echo.
adb devices -l
