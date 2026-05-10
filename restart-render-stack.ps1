param(
    [int]$IntervalMinutes = 20,
    [switch]$Once
)

$ErrorActionPreference = "Stop"

$rendererDir = "~\game-renderer"
$rccDir = "~\RCCServiceOther\RCCService2020"

function Write-Stamp([string]$Message) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$ts] $Message"
}

function Stop-RenderStack {
    Write-Stamp "Stopping game-renderer + RCCService2020 processes..."

    # Stop renderer node process started from this renderer folder.
    $rendererNodes = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "node.exe" -and $_.CommandLine -like "*$rendererDir*"
    }
    foreach ($p in $rendererNodes) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Stamp "Stopped node.exe PID $($p.ProcessId)"
    }

    # Stop RCCService instances from RCCService2020 folder.
    $rccProcesses = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "RCCService.exe" -and (
            ($_.ExecutablePath -like "*$rccDir*") -or
            ($_.CommandLine -match 'settingsfile\s+"?Settings\.json"?\s+-port\s+(1621|2621|3621|4621)')
        )
    }
    foreach ($p in $rccProcesses) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Stamp "Stopped RCCService.exe PID $($p.ProcessId)"
    }

    # Stop RCC wrapper batch/cmd processes from RCCService2020 folder.
    $rccCmds = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq "cmd.exe" -and (
            $_.CommandLine -like "*$rccDir*" -or
            $_.CommandLine -match "RCC(Player|Image|Game|Catalog)Render\.bat"
        )
    }
    foreach ($p in $rccCmds) {
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Stamp "Stopped cmd.exe PID $($p.ProcessId)"
    }
}

function Start-RenderStack {
    Write-Stamp "Starting RCCService2020 stack..."
    $rccExe = Join-Path $rccDir "RCCService.exe"
    $ports = @(1621, 2621, 3621, 4621)
    foreach ($port in $ports) {
        Start-Process -FilePath $rccExe -ArgumentList @("-Console", "-verbose", "-settingsfile", "Settings.json", "-port", "$port") -WorkingDirectory $rccDir -WindowStyle Hidden
        Write-Stamp "Started RCCService.exe on port $port"
    }

    Write-Stamp "Starting game-renderer..."
    Start-Process -FilePath "node" -ArgumentList "dist/Main.js" -WorkingDirectory $rendererDir -WindowStyle Hidden
}

if (-not (Test-Path $rendererDir)) { throw "Renderer folder not found: $rendererDir" }
if (-not (Test-Path $rccDir)) { throw "RCC folder not found: $rccDir" }

Write-Stamp "Render stack watchdog started. Interval: $IntervalMinutes minute(s)."
Write-Stamp "Press Ctrl+C to stop."

while ($true) {
    Stop-RenderStack
    Start-RenderStack

    if ($Once) {
        Write-Stamp "Run completed once."
        break
    }

    $sleepSeconds = [Math]::Max(60, $IntervalMinutes * 60)
    Write-Stamp "Next restart in $sleepSeconds seconds..."
    Start-Sleep -Seconds $sleepSeconds
}
