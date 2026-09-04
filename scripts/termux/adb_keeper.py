#!/data/data/com.termux/files/usr/bin/python
"""
Qython ADB Keeper - Mantém WiFi Debugging ativo no Android.
Roda no Termux para garantir estabilidade da conexão ADB.
"""
import subprocess
import time
import os

def run_cmd(cmd):
    """Executa comando shell e retorna output."""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        return result.stdout.strip()
    except:
        return ""

def is_wifi_debug_enabled():
    """Verifica se WiFi debugging está ativo."""
    result = run_cmd("settings get global adb_wifi_enabled")
    return result == "1"

def enable_wifi_debug():
    """Reativa WiFi debugging se estiver desabilitado."""
    print("🔄 Reativando WiFi Debugging...")
    run_cmd("settings put global adb_wifi_enabled 1")
    time.sleep(2)
    return is_wifi_debug_enabled()

def get_adb_port():
    """Tenta descobrir a porta ADB atual."""
    # Método 1: Verificar portas comuns
    import socket
    for port in range(37000, 45000):
        try:
            sock = socket.create_connection(("127.0.0.1", port), timeout=0.1)
            sock.close()
            return port
        except:
            continue
    return None

def log(msg):
    """Log com timestamp."""
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {msg}")

def main():
    log("🚀 Qython ADB Keeper iniciado")
    log("📱 Monitorando WiFi Debugging...")

    check_interval = 30  # segundos

    while True:
        try:
            if is_wifi_debug_enabled():
                port = get_adb_port()
                if port:
                    log(f"✅ WiFi Debugging OK (porta: {port})")
                else:
                    log("✅ WiFi Debugging ativo (porta não detectada)")
            else:
                log("⚠️ WiFi Debugging desativado!")
                if enable_wifi_debug():
                    log("✅ WiFi Debugging reativado com sucesso")
                else:
                    log("❌ Falha ao reativar WiFi Debugging")
        except Exception as e:
            log(f"❌ Erro: {e}")

        time.sleep(check_interval)

if __name__ == "__main__":
    main()
