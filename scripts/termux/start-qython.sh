#!/data/data/com.termux/files/usr/bin/bash
# Qython - Script de inicialização do Termux
# Este script mantém a conexão ADB estável

# Impede o Android de matar o Termux
termux-wake-lock

# Vai para o diretório do Qython
cd ~/qython-dev

# Mata processos anteriores
pkill -f adb_keeper.py 2>/dev/null

# Inicia o keeper em background
echo "🚀 Iniciando Qython ADB Keeper..."
nohup python adb_keeper.py > adb_keeper.log 2>&1 &

echo "✅ Qython ADB Keeper rodando em background"
echo "📄 Log: ~/qython-dev/adb_keeper.log"
