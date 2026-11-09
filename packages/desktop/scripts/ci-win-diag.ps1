# Diagnóstico do instalador NSIS parado no CI do Windows: quem está vivo, que janelas existem, se o
# processo gasta CPU, e uma foto da tela (vai como artifact). Só roda quando o instalador não anda.
param([string]$OutDir)
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

"=== processos com janela"
Get-Process | Where-Object { $_.MainWindowTitle } | Select-Object Id, ProcessName, MainWindowTitle, Responding |
  Format-Table -AutoSize | Out-String -Width 200

"=== instalador e filhos"
Get-CimInstance Win32_Process | Where-Object { $_.Name -like 'Qython*' -or $_.ParentProcessId -in (Get-Process -Name 'Qython-*' -ErrorAction SilentlyContinue).Id } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine | Format-List | Out-String -Width 200

"=== CPU do instalador (5 s)"
$p = Get-Process -Name 'Qython-*' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($p) {
  $a = $p.CPU; Start-Sleep -Seconds 5; $p.Refresh()
  "CPU: $a -> $($p.CPU); handles: $($p.HandleCount); threads: $($p.Threads.Count); estado das threads:"
  $p.Threads | Group-Object ThreadState, WaitReason | ForEach-Object { "  $($_.Name): $($_.Count)" }
}

"=== tela"
try {
  Add-Type -AssemblyName System.Windows.Forms, System.Drawing
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  [System.Drawing.Graphics]::FromImage($bmp).CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)
  $bmp.Save((Join-Path $OutDir 'tela.png'))
  "salva em $OutDir\tela.png ($($b.Width)x$($b.Height))"
} catch { "sem captura de tela: $_" }
