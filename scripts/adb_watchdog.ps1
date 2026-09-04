# Qython ADB Watchdog
# Mantém a conexão ADB ativa com o dispositivo de desenvolvimento
# Executa: powershell -ExecutionPolicy Bypass -File adb_watchdog.ps1

$DEVICE_IP = "<IP_LOCAL_DO_APARELHO>"
$CHECK_INTERVAL = 30  # segundos entre verificações
$PING_INTERVAL = 60   # segundos entre pings ADB (mantém conexão viva)
$LOG_FILE = "$PSScriptRoot\adb_watchdog.log"
$PORT_FILE = "$PSScriptRoot\.last_adb_port"

function Write-Log {
    param($Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] $Message"
    Write-Host $logMessage
    Add-Content -Path $LOG_FILE -Value $logMessage
}

function Get-LastPort {
    if (Test-Path $PORT_FILE) {
        return (Get-Content $PORT_FILE).Trim()
    }
    return $null
}

function Save-Port {
    param($Port)
    Set-Content -Path $PORT_FILE -Value $Port
}

function Test-AdbConnection {
    $devices = adb devices 2>&1
    return $devices -match "$DEVICE_IP.*device"
}

function Get-ConnectedPort {
    $devices = adb devices -l 2>&1
    if ($devices -match "$DEVICE_IP`:(\d+)") {
        return $matches[1]
    }
    return $null
}

function Send-AdbPing {
    # Executa um comando leve para manter a conexão ativa
    $result = adb shell echo "ping" 2>&1
    return $result -eq "ping"
}

function Connect-Adb {
    param($Port)
    Write-Log "Tentando conectar em ${DEVICE_IP}:${Port}..."
    $result = adb connect "${DEVICE_IP}:${Port}" 2>&1

    if ($result -match "connected|already connected") {
        Write-Log "Conectado com sucesso!"
        Save-Port $Port
        return $true
    }
    Write-Log "Falha na conexão: $result"
    return $false
}

# Início
Write-Log "=== Qython ADB Watchdog Iniciado ==="
Write-Log "Dispositivo: $DEVICE_IP"
Write-Log "Intervalo de verificação: ${CHECK_INTERVAL}s"

$lastPingTime = Get-Date
$consecutiveFailures = 0

while ($true) {
    try {
        $isConnected = Test-AdbConnection

        if ($isConnected) {
            $consecutiveFailures = 0
            $currentPort = Get-ConnectedPort

            # Ping periódico para manter conexão viva
            $timeSinceLastPing = (Get-Date) - $lastPingTime
            if ($timeSinceLastPing.TotalSeconds -ge $PING_INTERVAL) {
                if (Send-AdbPing) {
                    Write-Log "Ping OK - Conexão estável (porta: $currentPort)"
                } else {
                    Write-Log "Ping falhou - Conexão pode estar instável"
                }
                $lastPingTime = Get-Date
            }
        } else {
            $consecutiveFailures++
            Write-Log "Conexão perdida! (tentativa $consecutiveFailures)"

            # Tenta reconectar com a última porta conhecida
            $lastPort = Get-LastPort
            if ($lastPort) {
                $reconnected = Connect-Adb -Port $lastPort
                if (-not $reconnected -and $consecutiveFailures -ge 3) {
                    Write-Log "AVISO: Multiplas falhas. Verifique a porta no celular."
                    Write-Log "Configurações > Opções do desenvolvedor > Depuração sem fio"
                }
            } else {
                Write-Log "ERRO: Nenhuma porta conhecida. Execute adb_connect.bat primeiro."
            }
        }
    } catch {
        Write-Log "ERRO: $_"
    }

    Start-Sleep -Seconds $CHECK_INTERVAL
}
