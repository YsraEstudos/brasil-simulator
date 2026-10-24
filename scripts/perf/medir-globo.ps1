#Requires -Version 7
<#
.SYNOPSIS
  Mede o globo (expo-gl) no aparelho Android via adb: quadros apresentados (SurfaceFlinger), memoria, bateria, temperatura e CPU.

.EXAMPLE
  pwsh scripts/perf/medir-globo.ps1 -Scenario arrastar -Seconds 60
  pwsh scripts/perf/medir-globo.ps1 -Scenario repouso -Package com.exemplo.brasil

.NOTES
  `dumpsys gfxinfo` mede so a UI (HWUI), NAO o globo; por isso a temporizacao vem de `SurfaceFlinger --latency`
  na camada da SurfaceView do app. Estatistica em scripts/perf/parseLatency.mjs (precisa de Node no PATH).
  Veja docs/MEDICAO_GLOBO.md.
#>
[CmdletBinding()]
param(
  # Pacote Android. Se omitido, le expo.android.package de app.json.
  [string]$Package,
  # Nome do cenario (vai para o nome dos arquivos e para a tabela). Ex.: arrastar, repouso, camadas, sessao.
  [Parameter(Mandatory)][string]$Scenario,
  [int]$Seconds = 60,
  # Pasta de saida. Padrao: docs/medicoes na raiz do repositorio.
  [string]$Out,
  # Caminho do adb. Padrao: adb do PATH ou do Android SDK do usuario.
  [string]$Adb,
  # Forca o nome da camada (de `adb shell dumpsys SurfaceFlinger --list`), se a deteccao automatica errar.
  [string]$Layer,
  # Intervalo entre consultas ao SurfaceFlinger (o buffer guarda 128 quadros ~ 2 s a 60 fps).
  [double]$PollSeconds = 1.5,
  [switch]$SkipCpu,
  # Segundos com o globo parado antes da medição (0 desliga). O critério do RELEASE_GLOBO vale depois do aquecimento.
  [int]$AquecimentoSeg = 15,
  # Não usa `dumpsys battery unplug` (por padrão o aparelho é tratado como desconectado durante a medição).
  [switch]$SemUnplug
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..' '..')).Path
if (-not $Out) { $Out = Join-Path $repoRoot 'docs' 'medicoes' }
$parser = Join-Path $PSScriptRoot 'parseLatency.mjs'

# `throw` (e não `exit`) para o `finally` que restaura a bateria rodar.
function Stop-Com([string]$msg) { throw $msg }

# --- adb ---
if (-not $Adb) {
  $cmd = Get-Command adb -ErrorAction SilentlyContinue
  if ($cmd) { $Adb = $cmd.Source }
  else { $Adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }
}
if (-not (Test-Path $Adb)) { Stop-Com "adb nao encontrado em '$Adb'. Passe -Adb <caminho do adb.exe>." }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-Com 'Node nao encontrado no PATH (necessario para calcular as estatisticas).' }

function Invoke-Adb([string]$shellCmd) {
  # Junta stdout/stderr, remove CR do adb no Windows.
  $r = & $Adb shell $shellCmd 2>&1 | Out-String
  return ($r -replace "`r", '')
}

# --- pacote ---
if (-not $Package) {
  $appJson = Join-Path $repoRoot 'app.json'
  if (Test-Path $appJson) {
    $Package = (Get-Content $appJson -Raw | ConvertFrom-Json).expo.android.package
  }
  if (-not $Package) { Stop-Com 'Pacote nao encontrado em app.json (expo.android.package). Passe -Package <id.do.pacote>.' }
}

# --- aparelho ---
$devs = (& $Adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\S' }
$ok = @($devs | Where-Object { $_ -match "`tdevice$" })
if ($ok.Count -eq 0) {
  $bad = ($devs -join '; ')
  Stop-Com "Nenhum aparelho autorizado. Ative a Depuracao USB, conecte o cabo e aceite o pedido no celular. adb devices: $bad"
}
if ($ok.Count -gt 1) { Stop-Com 'Mais de um aparelho conectado; desconecte os outros (ou defina ANDROID_SERIAL).' }

$model = (Invoke-Adb 'getprop ro.product.model').Trim()
$android = (Invoke-Adb 'getprop ro.build.version.release').Trim()
$fingerprint = (Invoke-Adb 'getprop ro.build.fingerprint').Trim()
Write-Host "Aparelho: $model, Android $android"
Write-Host "Fingerprint: $fingerprint"

$procPid = (Invoke-Adb "pidof $Package").Trim().Split(' ')[0]
if (-not $procPid) { Stop-Com "O app '$Package' nao esta em execucao. Abra o app no Painel e tente de novo." }
Write-Host "Pacote: $Package (pid $procPid)"

# --- leituras pontuais ---
function Get-Bateria {
  $t = Invoke-Adb 'dumpsys battery'
  $lvl = if ($t -match '(?m)^\s*level:\s*(\d+)') { [int]$Matches[1] } else { $null }
  $tmp = if ($t -match '(?m)^\s*temperature:\s*(-?\d+)') { [int]$Matches[1] / 10.0 } else { $null }
  [pscustomobject]@{ Nivel = $lvl; TempC = $tmp }
}

function Get-Termico {
  # Formato varia por aparelho; pega Temperature{mValue=36.4, mType=..., mName=...} e devolve o maior valor valido.
  $t = Invoke-Adb 'dumpsys thermalservice'
  $vals = foreach ($m in [regex]::Matches($t, 'Temperature\{mValue=(-?[\d.]+),\s*mType=\d+,\s*mName=([^,}]+)')) {
    $v = [double]::Parse($m.Groups[1].Value, [Globalization.CultureInfo]::InvariantCulture)
    if ($v -gt -50 -and $v -lt 200) { [pscustomobject]@{ Nome = $m.Groups[2].Value; Valor = $v } }
  }
  $vals = @($vals)
  if ($vals.Count -eq 0) { return [pscustomobject]@{ Disponivel = $false; MaxC = $null; Detalhe = 'indisponivel' } }
  $max = ($vals | Sort-Object Valor -Descending | Select-Object -First 1)
  $det = ($vals | Select-Object -First 6 | ForEach-Object { '{0}={1:N1}' -f $_.Nome, $_.Valor }) -join ' '
  [pscustomobject]@{ Disponivel = $true; MaxC = $max.Valor; Detalhe = $det }
}

function Get-Memoria {
  $t = Invoke-Adb "dumpsys meminfo $Package"
  function Pick([string]$re) { if ($t -match $re) { [math]::Round([double]$Matches[1] / 1024, 1) } else { $null } }
  $pss = Pick '(?m)TOTAL PSS:\s*(\d+)'
  if ($null -eq $pss) { $pss = Pick '(?m)^\s*TOTAL\s+(\d+)' }
  [pscustomobject]@{
    PssMB      = $pss
    GraphicsMB = Pick '(?m)^\s*Graphics:\s*(\d+)'
    GlMtrackMB = Pick '(?m)^\s*GL mtrack\s+(\d+)'
  }
}

function Get-CpuPct {
  # toybox top: o 1o ciclo e media desde o inicio; pega a ultima amostra de 2 ciclos (1 s). 100% = 1 nucleo.
  $t = Invoke-Adb "top -b -n 2 -d 1 -p $procPid"
  $v = $null
  foreach ($line in ($t -split "`n")) {
    if ($line -match "^\s*$procPid\s+.*\s[RSDZTtIX]\s+(\d+(?:[.,]\d+)?)\s") { $v = [double]::Parse($Matches[1].Replace(',', '.'), [Globalization.CultureInfo]::InvariantCulture) }
  }
  return $v
}

function Fmt($v, [string]$f = 'N1') { if ($null -eq $v) { '-' } else { ([double]$v).ToString($f, [Globalization.CultureInfo]::InvariantCulture) } }

# --- camada da SurfaceView ---
function Find-Layer {
  if ($Layer) { return $Layer }
  $lines = (Invoke-Adb 'dumpsys SurfaceFlinger --list') -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ }
  $c = @($lines | Where-Object { $_ -like "*$Package*" -and $_ -like '*SurfaceView*' -and $_ -notlike 'Background for*' })
  # expo-gl (GLView) é um TextureView: não tem camada SurfaceView própria; os quadros saem na janela da Activity.
  if ($c.Count -eq 0) {
    $c = @($lines | Where-Object { $_ -like "*$Package*MainActivity*" -and $_ -notlike 'Background for*' })
  }
  if ($c.Count -eq 0) { return $null }
  # Android 12+ lista a camada "(BLAST)" que de fato recebe os quadros; no Android 11 e a unica.
  $blast = @($c | Where-Object { $_ -like '*BLAST*' })
  if ($blast.Count -gt 0) { return $blast[0] }
  return $c[0]
}

$layerName = Find-Layer
if (-not $layerName) {
  Stop-Com "Camada da SurfaceView de '$Package' nao encontrada em SurfaceFlinger --list. Abra a tela do globo (Painel) e rode de novo; ou use -Layer."
}
Write-Host "Camada: $layerName"

# --- desconecta a carga (corta o carregamento por software) e restaura no fim, mesmo se algo falhar ---
if (-not $SemUnplug) { [void](Invoke-Adb 'dumpsys battery unplug') }
try {
  # --- aquecimento: o globo já aberto e parado, antes de qualquer leitura ou consulta ---
  for ($t = $AquecimentoSeg; $t -gt 0; $t--) {
    Write-Progress -Activity 'Aquecimento do globo' -Status "Deixe o globo parado: $t s (nada de toques)" -PercentComplete (100 * ($AquecimentoSeg - $t) / [math]::Max(1, $AquecimentoSeg))
    Start-Sleep -Seconds 1
  }
  Write-Progress -Activity 'Aquecimento do globo' -Completed

  # --- inicio ---
  $batIni = Get-Bateria
  $termIni = Get-Termico
  $memIni = Get-Memoria
  Write-Host ("Inicio: bateria {0}% / {1} C; termico max {2} C; PSS {3} MB; Graphics {4} MB" -f $batIni.Nivel, (Fmt $batIni.TempC), (Fmt $termIni.MaxC), (Fmt $memIni.PssMB), (Fmt $memIni.GraphicsMB))
  if (-not $termIni.Disponivel) { Write-Warning 'thermalservice sem temperaturas neste aparelho; usando so a temperatura da bateria.' }

  $tmpDir = Join-Path ([IO.Path]::GetTempPath()) ("medir-globo-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tmpDir | Out-Null

  # --- amostragem ---
  [void](Invoke-Adb "dumpsys SurfaceFlinger --latency-clear '$layerName'")
  Write-Host "Medindo '$Scenario' por $Seconds s. Faca o cenario no aparelho AGORA (nao encoste no cabo/tela do PC)."
  $cpuSamples = New-Object System.Collections.Generic.List[double]
  $files = New-Object System.Collections.Generic.List[string]
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $i = 0
  $falhas = 0
  # CPU só antes e depois da janela: cada leitura leva ~1 s e, no meio do laço, faria a consulta ao SurfaceFlinger
  # demorar o bastante para o buffer de 128 quadros (~2 s) perder quadros, o que parece jank que não existe.
  if (-not $SkipCpu) { $c = Get-CpuPct; if ($null -ne $c) { $cpuSamples.Add($c) } }
  while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
    $txt = Invoke-Adb "dumpsys SurfaceFlinger --latency '$layerName'"
    if (($txt -split "`n").Count -lt 2) {
      $falhas++
      $nl = Find-Layer
      if ($nl) { $layerName = $nl }
      if ($falhas -gt 5) { Write-Warning 'Consultas ao SurfaceFlinger voltando vazias; a camada pode ter sido recriada.' }
    } else {
      $f = Join-Path $tmpDir ('lat{0:D5}.txt' -f $i++)
      Set-Content -Path $f -Value $txt -Encoding utf8
      $files.Add($f)
    }
    Start-Sleep -Milliseconds ([int]($PollSeconds * 1000))
    Write-Progress -Activity "Medindo $Scenario" -Status ('{0:N0}/{1} s' -f $sw.Elapsed.TotalSeconds, $Seconds) -PercentComplete ([math]::Min(100, 100 * $sw.Elapsed.TotalSeconds / $Seconds))
  }
  Write-Progress -Activity "Medindo $Scenario" -Completed
  if (-not $SkipCpu) { $c = Get-CpuPct; if ($null -ne $c) { $cpuSamples.Add($c) } }

  # --- fim ---
  $batFim = Get-Bateria
  $termFim = Get-Termico
  $memFim = Get-Memoria

  # --- estatistica ---
  New-Item -ItemType Directory -Force -Path $Out | Out-Null
  $stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'
  $slug = ($Scenario -replace '[^\w\-]+', '_')
  $csv = Join-Path $Out "$stamp`_$slug.csv"
  if ($files.Count -eq 0) { Stop-Com 'Nenhuma consulta ao SurfaceFlinger retornou dados.' }
  # Lista em arquivo, não na linha de comando: uma sessão de 30 min tem ~1.200 consultas e estoura o limite do Windows.
  $lista = Join-Path $tmpDir 'arquivos.txt'
  Set-Content -Path $lista -Value $files -Encoding utf8
  $json = & node $parser --csv $csv --lista $lista
  if ($LASTEXITCODE -ne 0) { Stop-Com "Falha no parser: $json" }
  $s = $json | ConvertFrom-Json
  Write-Host ("RAW_DIR: " + $tmpDir)

  $cpuMed = if ($cpuSamples.Count) { ($cpuSamples | Measure-Object -Average).Average } else { $null }
  $memPss = if ($null -ne $memFim.PssMB) { $memFim.PssMB } else { $memIni.PssMB }
  $memGfx = if ($null -ne $memFim.GraphicsMB) { $memFim.GraphicsMB } else { $memFim.GlMtrackMB }
  $tIni = if ($termIni.Disponivel) { $termIni.MaxC } else { $batIni.TempC }
  $tFim = if ($termFim.Disponivel) { $termFim.MaxC } else { $batFim.TempC }
  $dBat = if ($null -ne $batIni.Nivel -and $null -ne $batFim.Nivel) { $batFim.Nivel - $batIni.Nivel } else { $null }

  Write-Host ''
  Write-Host "=== $Scenario ($Seconds s) ==="
  if ($s.frames -eq 0) {
    Write-Host 'Quadros apresentados: 0 (laco parado: esperado no repouso; se estava mexendo, confira a camada).'
  } else {
    Write-Host ("Quadros: {0} (intervalos validos {1}, pausas >500 ms ignoradas {2}, tempo ativo {3} s)" -f $s.frames, $s.intervals, $s.idleGaps, (Fmt $s.activeSeconds))
    Write-Host ("Intervalo p50 {0} ms | p95 {1} ms | p99 {2} ms | max {3} ms | {4} fps | quadros >100 ms: {5}" -f (Fmt $s.p50), (Fmt $s.p95), (Fmt $s.p99), (Fmt $s.max), (Fmt $s.fps), $s.jank)
  }
  Write-Host ("PSS {0} MB | Graphics {1} MB | GL mtrack {2} MB | CPU medio {3}% (100% = 1 nucleo)" -f (Fmt $memPss), (Fmt $memGfx), (Fmt $memFim.GlMtrackMB), (Fmt $cpuMed))
  Write-Host ("Bateria {0}% -> {1}% (delta {2}) | Temp {3} -> {4} C" -f $batIni.Nivel, $batFim.Nivel, (Fmt $dBat '0'), (Fmt $tIni), (Fmt $tFim))
  if ($termFim.Disponivel) { Write-Host "Termico (fim): $($termFim.Detalhe)" }
  Write-Host "CSV: $csv"

  # --- resumo em Markdown ---
  $md = Join-Path $Out 'resultados.md'
  if (-not (Test-Path $md)) {
    @(
      '# Resultados das medicoes do globo (adb)',
      '',
      'Gerado por `scripts/perf/medir-globo.ps1`. Intervalos em ms entre quadros apresentados (SurfaceFlinger). Veja docs/MEDICAO_GLOBO.md.',
      '',
      '| Data | Aparelho | Cenario | Duracao (s) | p50 (ms) | p95 (ms) | p99 (ms) | fps | Quadros >100 ms | PSS (MB) | Graphics (MB) | CPU (%) | Bateria (delta) | Temp inicio (C) | Temp fim (C) |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
    ) | Set-Content -Path $md -Encoding utf8
  }
  $row = '| {0} | {1} (Android {2}) | {3} | {4} | {5} | {6} | {7} | {8} | {9} | {10} | {11} | {12} | {13} | {14} | {15} |' -f `
    (Get-Date -Format 'yyyy-MM-dd HH:mm'), $model, $android, $Scenario, $Seconds, (Fmt $s.p50), (Fmt $s.p95), (Fmt $s.p99), (Fmt $s.fps), $s.jank, `
    (Fmt $memPss), (Fmt $memGfx), (Fmt $cpuMed), (Fmt $dBat '0'), (Fmt $tIni), (Fmt $tFim)
  Add-Content -Path $md -Value $row -Encoding utf8
  Write-Host "Linha adicionada a $md"
} finally {
  if (-not $SemUnplug) { [void](Invoke-Adb 'dumpsys battery reset') }
}
