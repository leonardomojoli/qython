# Qython - Android Development Setup

## Dispositivo de Desenvolvimento

| Propriedade | Valor |
|-------------|-------|
| **Modelo** | Samsung Galaxy A22 |
| **Código** | SM-A225M |
| **Android** | 13 (API 33) |
| **Device ID** | a22 |
| **IP Local** | 192.168.15.3 |
| **IP Meshnet** | 100.76.66.17 |

## Conexão ADB via WiFi

### Pré-requisitos no Celular

1. **Ativar Opções do Desenvolvedor:**
   - Configurações → Sobre o telefone → Informações do software
   - Tocar 7x em "Número da versão"

2. **Ativar Depuração sem Fio:**
   - Configurações → Opções do desenvolvedor → Depuração sem fio (ON)

### Conectar

**Primeira vez (pareamento):**
```bash
# No celular: Depuração sem fio → Parear dispositivo com código
# Pegar IP:porta e código de 6 dígitos
adb pair <IP>:<PORTA_PAREAMENTO> <CODIGO>
```

**Conexões subsequentes:**
```bash
# Usar o script de conexão
scripts\adb_connect.bat <PORTA>

# Ou manualmente
adb connect 192.168.15.3:<PORTA>
```

> **Nota:** A porta muda após reiniciar o celular ou desativar/ativar a depuração sem fio.
> Verifique a porta atual em: Configurações → Opções do desenvolvedor → Depuração sem fio

### Verificar Conexão

```bash
adb devices -l
```

Deve mostrar:
```
192.168.15.3:XXXXX     device product:a22ub model:SM_A225M device:a22
```

## Comandos Úteis

```bash
# Instalar APK
adb install app-debug.apk

# Ver logs do app
adb logcat -s "QythonApp"

# Limpar dados do app
adb shell pm clear ai.qython.app

# Screenshot
adb exec-out screencap -p > screenshot.png

# Gravar tela
adb shell screenrecord /sdcard/video.mp4
adb pull /sdcard/video.mp4
```

## Manter Conexão Estável

### Watchdog (Recomendado)

O watchdog monitora a conexão e reconecta automaticamente se cair:

```bash
# Iniciar watchdog (deixar rodando)
scripts\start_adb_watchdog.bat
```

O watchdog:
- Verifica conexão a cada 30 segundos
- Envia ping ADB a cada 60 segundos (mantém conexão viva)
- Reconecta automaticamente usando a última porta conhecida
- Gera log em `scripts\adb_watchdog.log`

### Configurações Aplicadas no Android

| Setting | Valor | Efeito |
|---------|-------|--------|
| `stay_on_while_plugged_in` | 7 | Tela ligada carregando |
| `wifi_sleep_policy` | 2 | WiFi nunca dorme |
| Battery whitelist | shell | ADB não otimizado |

### Verificar Estabilidade

```bash
# Status da bateria (deve mostrar AC powered: true)
adb shell dumpsys battery

# Testar conexão
adb shell echo "OK"
```

## Termux ADB Keeper (Android)

O Termux roda um script que mantém o WiFi Debugging ativo e monitora a conexão.

### Arquivos no Termux
```
~/qython-dev/
├── adb_keeper.py      # Script que monitora WiFi debugging
├── start-qython.sh    # Script de inicialização
└── adb_keeper.log     # Log do keeper

~/.termux/boot/
└── start-qython.sh    # Link para auto-iniciar no boot
```

### Comandos úteis no Termux
```bash
# Ver log do keeper
cat ~/qython-dev/adb_keeper.log

# Reiniciar keeper
pkill -f adb_keeper.py
cd ~/qython-dev && nohup python adb_keeper.py > adb_keeper.log 2>&1 &

# Ver processos
ps aux | grep python
```

## Acesso Remoto (Meshnet)

A conexão ADB WiFi só funciona na **mesma rede local**. Para acesso remoto, usamos **NordVPN Meshnet**.

### Configuração

1. Instalar **NordVPN** no celular e no PC
2. Ativar **Meshnet** em ambos os dispositivos
3. Os dispositivos aparecem na lista Meshnet com IPs `100.x.x.x`

### Conectar via Meshnet

```bash
# Conectar usando IP Meshnet (funciona de qualquer rede)
adb connect 100.76.66.17:<PORTA>

# Exemplo com porta atual
adb connect 100.76.66.17:41335

# Visualizar tela
scrcpy -s 100.76.66.17:<PORTA>
```

### Vantagens da Meshnet

- Funciona de qualquer rede (casa, trabalho, celular 4G)
- Conexão criptografada peer-to-peer
- Não precisa de port forwarding ou IP público
- Baixa latência comparado a VPN tradicional

## Estrutura do Projeto

```
qython/
├── mobile/                    # App Android (futuro)
│   ├── app/
│   └── build.gradle
├── scripts/
│   ├── adb_connect.bat        # Script de conexão manual
│   ├── start_adb_watchdog.bat # Inicia watchdog (PC)
│   ├── adb_watchdog.ps1       # Script do watchdog (PC)
│   ├── adb_watchdog.log       # Log do watchdog (PC)
│   ├── .last_adb_port         # Última porta usada
│   └── termux/                # Scripts para o Termux
│       ├── adb_keeper.py
│       ├── start-qython.sh
│       └── INSTALL.md
└── docs/
    └── ANDROID_DEV_SETUP.md
```
