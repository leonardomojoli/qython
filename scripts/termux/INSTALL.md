# Instalação do Qython ADB Keeper no Termux

## Pré-requisitos

1. **Termux** instalado (F-Droid)
2. **Termux:Boot** instalado (F-Droid) - para auto-iniciar
3. **Permissões já concedidas** via PC (WRITE_SECURE_SETTINGS, DUMP)

## Instalação

### 1. No Termux, instalar dependências:

```bash
pkg update && pkg upgrade -y
pkg install python
```

### 2. Criar diretório e copiar arquivos:

```bash
mkdir -p ~/qython-dev
mkdir -p ~/.termux/boot
```

### 3. Copiar os arquivos do PC para o Termux:

**Opção A - Via ADB (do PC):**
```bash
adb push adb_keeper.py /data/data/com.termux/files/home/qython-dev/
adb push start-qython.sh /data/data/com.termux/files/home/qython-dev/
```

**Opção B - Copiar manualmente no Termux:**
```bash
# Cole o conteúdo dos arquivos usando nano ou vi
nano ~/qython-dev/adb_keeper.py
nano ~/qython-dev/start-qython.sh
```

### 4. Configurar permissões:

```bash
chmod +x ~/qython-dev/start-qython.sh
chmod +x ~/qython-dev/adb_keeper.py
```

### 5. Configurar boot automático:

```bash
# Criar link para script de boot
ln -sf ~/qython-dev/start-qython.sh ~/.termux/boot/start-qython.sh
```

### 6. Abrir Termux:Boot uma vez

Abra o app **Termux:Boot** no celular uma vez para registrar o receiver.

## Testar

```bash
# Executar manualmente
cd ~/qython-dev
./start-qython.sh

# Ver log
tail -f ~/qython-dev/adb_keeper.log
```

## Verificar após reinício

Após reiniciar o celular:
1. Aguarde ~30 segundos
2. O Termux:Boot vai iniciar automaticamente
3. O ADB Keeper vai manter o WiFi debugging ativo

Do PC:
```bash
adb connect <IP_LOCAL_DO_APARELHO>:<PORTA>
adb devices
```

## Troubleshooting

| Problema | Solução |
|----------|---------|
| Termux não inicia no boot | Verifique se Termux:Boot está instalado e foi aberto uma vez |
| WiFi Debugging desativa | Verifique se as permissões WRITE_SECURE_SETTINGS foram concedidas |
| Porta mudou | A porta muda após reinício. Verifique nas configurações do Android |
