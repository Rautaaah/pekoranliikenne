$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot 'RCCService2020\RCCService.exe'
$bytes = [System.IO.File]::ReadAllBytes($exe)
$ascii = [System.Text.Encoding]::ASCII.GetString($bytes)

# Walk through the file and emit every printable ASCII run of length >= 6.
$out = New-Object System.Text.StringBuilder 4096
$buf = New-Object System.Text.StringBuilder 256
function Flush {
    param($buf,$out)
    if ($buf.Length -ge 6) {
        $s = $buf.ToString()
        if ($s -match '(?i)(invalid json|placeid|gameid|machineaddress|baseurl|matchmakingcontext|datacenterid|placevisitaccess|gameservicep|gamecode|jobid|placefetchurl|sessionid|teleport|launchermode|launchertoken|access[Kk]ey|gamerlobby|RobloxStartScript|RccService|gameserver\.json|JsonRequest|jsonrequest)') {
            [void]$out.AppendLine($s)
        }
    }
    [void]$buf.Clear()
}
foreach ($b in $bytes) {
    if ($b -ge 32 -and $b -lt 127) {
        [void]$buf.Append([char]$b)
    } else {
        Flush $buf $out
    }
}
Flush $buf $out
$out.ToString()
