<#
.SYNOPSIS
    Replace the embedded application icon of a Windows .exe with a
    multi-resolution icon built from a source PNG.

.DESCRIPTION
    One-shot tool used to rebrand `RobloxPlayerBeta.exe` and
    `RobloxStudioBeta.exe` so they display the Zekoro Z logo in Explorer,
    the taskbar, and Alt-Tab.

    Implementation overview:
      1. Build a multi-resolution `.ico` in memory by rendering the PNG
         at every size in -Sizes and packing each rendered image as a
         PNG-compressed ICONDIRENTRY.
      2. Open the target exe with BeginUpdateResource().
      3. Write each icon image as an RT_ICON resource at ids 100..N.
      4. Build a GRPICONDIR + GRPICONDIRENTRY[] record pointing at those
         ids and write it as a single RT_GROUP_ICON resource. Every
         existing group icon found in the target is overwritten with the
         same record so the shell can never pick up the old artwork.

.PARAMETER Target
    Path to the .exe to rebrand. The file must not be in use by another
    process (Windows locks running exes).

.PARAMETER IconPng
    Path to the source PNG. Defaults to the bundled
    `clients/bootstrapper/icon.png` next to this script.

.PARAMETER Sizes
    Icon sizes (pixels) to bake into the resulting .ico. Defaults match
    what Windows actually uses across DPI scales.

.EXAMPLE
    PS> .\Set-ExeIcon.ps1 -Target ..\2020\RobloxPlayerBeta.exe
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)] [string]$Target,
    [string]$IconPng,
    [int[]]$Sizes = @(16, 24, 32, 48, 64, 128, 256)
)

$ErrorActionPreference = 'Stop'

# Resolve the script directory ourselves; $PSScriptRoot is unreliable as a
# default-parameter expression depending on PowerShell host.
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $IconPng) {
    $IconPng = Join-Path $scriptDir '..\bootstrapper\icon.png'
}

if (-not (Test-Path -LiteralPath $Target))  { throw "target exe not found: $Target" }
if (-not (Test-Path -LiteralPath $IconPng)) { throw "source PNG not found: $IconPng" }

$Target  = (Resolve-Path -LiteralPath $Target).Path
$IconPng = (Resolve-Path -LiteralPath $IconPng).Path

# ---------------------------------------------------------------------------
# Build a multi-resolution .ico in memory from the PNG. Each entry is itself
# PNG-compressed (the post-Vista format). bWidth/bHeight are written as 0 for
# 256-pixel entries per the spec.
# ---------------------------------------------------------------------------
Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Image]::FromFile($IconPng)
try {
    $msIco = New-Object System.IO.MemoryStream
    $bw    = New-Object System.IO.BinaryWriter $msIco

    # ICONDIR
    $bw.Write([uint16]0)                # idReserved
    $bw.Write([uint16]1)                # idType (1 = icon)
    $bw.Write([uint16]$Sizes.Count)     # idCount

    # Reserve 16-byte slots for ICONDIRENTRY[]; backfilled below.
    $entryTableStart = $msIco.Position
    $zeroEntry = New-Object byte[] (16 * $Sizes.Count)
    $bw.Write($zeroEntry)

    $imageMeta = @()
    foreach ($s in $Sizes) {
        $bmp = New-Object System.Drawing.Bitmap $s, $s
        $g   = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode  = 'HighQualityBicubic'
        $g.SmoothingMode      = 'HighQuality'
        $g.PixelOffsetMode    = 'HighQuality'
        $g.CompositingQuality = 'HighQuality'
        $g.DrawImage($src, 0, 0, $s, $s)
        $g.Dispose()

        $imgStart = $msIco.Position
        $bmp.Save($msIco, [System.Drawing.Imaging.ImageFormat]::Png)
        $imgEnd   = $msIco.Position
        $bmp.Dispose()

        $imageMeta += [pscustomobject]@{
            Size   = $s
            Offset = [uint32]$imgStart
            Bytes  = [uint32]($imgEnd - $imgStart)
        }
    }

    # Backfill the ICONDIRENTRY table.
    $msIco.Position = $entryTableStart
    foreach ($m in $imageMeta) {
        $b = if ($m.Size -ge 256) { [byte]0 } else { [byte]$m.Size }
        $bw.Write([byte]$b)             # bWidth
        $bw.Write([byte]$b)             # bHeight
        $bw.Write([byte]0)              # bColorCount (0 = >256 colours)
        $bw.Write([byte]0)              # bReserved
        $bw.Write([uint16]1)            # wPlanes
        $bw.Write([uint16]32)           # wBitCount (RGBA)
        $bw.Write([uint32]$m.Bytes)
        $bw.Write([uint32]$m.Offset)
    }

    $icoBytes = $msIco.ToArray()
} finally {
    $src.Dispose()
}

# ---------------------------------------------------------------------------
# Win32 resource APIs (cached across script runs)
# ---------------------------------------------------------------------------
if (-not ('Zekoro.IconUpdater' -as [type])) {
    Add-Type -Namespace Zekoro -Name IconUpdater -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern IntPtr BeginUpdateResourceW(string fileName, bool deleteExistingResources);

[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern bool UpdateResourceW(IntPtr hUpdate, IntPtr lpType, IntPtr lpName, ushort wLang, byte[] lpData, uint cbData);

[DllImport("kernel32.dll", SetLastError=true)]
public static extern bool EndUpdateResourceW(IntPtr hUpdate, bool discard);

[DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
public static extern IntPtr LoadLibraryExW(string fileName, IntPtr hReservedNull, uint dwFlags);

[DllImport("kernel32.dll", SetLastError=true)]
public static extern bool FreeLibrary(IntPtr hModule);

public delegate bool EnumResNameProc(IntPtr hModule, IntPtr lpType, IntPtr lpName, IntPtr lParam);

[DllImport("kernel32.dll", SetLastError=true)]
public static extern bool EnumResourceNamesW(IntPtr hModule, IntPtr lpType, EnumResNameProc lpEnumFunc, IntPtr lParam);
"@
}

$RT_ICON                  = [IntPtr]3
$RT_GROUP_ICON            = [IntPtr]14
$LOAD_LIBRARY_AS_DATAFILE = [uint32]0x00000002

# ---------------------------------------------------------------------------
# Enumerate every existing RT_GROUP_ICON resource id in the target exe so we
# can overwrite ALL of them — this guarantees the shell can never resolve
# back to the original artwork via a higher-priority sibling.
# ---------------------------------------------------------------------------
$existingGroupIds = New-Object System.Collections.Generic.List[uint16]
$hMod = [Zekoro.IconUpdater]::LoadLibraryExW($Target, [IntPtr]::Zero, $LOAD_LIBRARY_AS_DATAFILE)
if ($hMod -ne [IntPtr]::Zero) {
    try {
        $cb = [Zekoro.IconUpdater+EnumResNameProc] {
            param([IntPtr]$hModule, [IntPtr]$lpType, [IntPtr]$lpName, [IntPtr]$lParam)
            # Integer-id resources have the high 48 bits clear (IS_INTRESOURCE).
            $addr = [uint64]$lpName
            if (($addr -shr 16) -eq 0) {
                $script:existingGroupIds.Add([uint16]($addr -band 0xFFFF))
            }
            return $true   # keep enumerating
        }
        [void][Zekoro.IconUpdater]::EnumResourceNamesW($hMod, $RT_GROUP_ICON, $cb, [IntPtr]::Zero)
    } finally {
        [void][Zekoro.IconUpdater]::FreeLibrary($hMod)
    }
}
if ($existingGroupIds.Count -eq 0) {
    # Nothing found — install a single new MAINICON-equivalent at id 1.
    $existingGroupIds.Add([uint16]1)
}
Write-Host "overwriting RT_GROUP_ICON ids:" ($existingGroupIds -join ', ')

# ---------------------------------------------------------------------------
# Re-parse the in-memory .ico we built so we can index each image's bytes
# back out for the RT_ICON writes.
# ---------------------------------------------------------------------------
$br      = New-Object System.IO.BinaryReader (New-Object System.IO.MemoryStream (,$icoBytes))
$null    = $br.ReadUInt16()  # reserved
$null    = $br.ReadUInt16()  # type
$count   = $br.ReadUInt16()
$entries = @()
for ($i = 0; $i -lt $count; $i++) {
    $w = $br.ReadByte(); $h = $br.ReadByte()
    $cc = $br.ReadByte(); $rs = $br.ReadByte()
    $pl = $br.ReadUInt16(); $bp = $br.ReadUInt16()
    $sz = $br.ReadUInt32(); $of = $br.ReadUInt32()
    $entries += [pscustomobject]@{
        Width = $w; Height = $h; ColorCount = $cc; Reserved = $rs
        Planes = $pl; Bpp = $bp
        Bytes = $sz; Offset = $of
    }
}

# ---------------------------------------------------------------------------
# Patch the exe.
# ---------------------------------------------------------------------------
$hUpd = [Zekoro.IconUpdater]::BeginUpdateResourceW($Target, $false)
if ($hUpd -eq [IntPtr]::Zero) {
    throw "BeginUpdateResource failed (LastError = $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
}

try {
    # Each icon image -> RT_ICON resource ids 100, 101, ...
    $newIds = @()
    for ($i = 0; $i -lt $entries.Count; $i++) {
        $e   = $entries[$i]
        $id  = [uint16](100 + $i)
        $img = New-Object byte[] ([int]$e.Bytes)
        [Array]::Copy($icoBytes, [int]$e.Offset, $img, 0, [int]$e.Bytes)
        $ok = [Zekoro.IconUpdater]::UpdateResourceW(
            $hUpd, $RT_ICON, [IntPtr][int]$id, 0, $img, [uint32]$e.Bytes)
        if (-not $ok) {
            throw "UpdateResource(RT_ICON id=$id) failed (LastError = $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
        }
        $newIds += $id
    }

    # GRPICONDIR + GRPICONDIRENTRY[] (14 bytes per entry; dwImageOffset:u32 -> nID:u16)
    $msG = New-Object System.IO.MemoryStream
    $bwg = New-Object System.IO.BinaryWriter $msG
    $bwg.Write([uint16]0)
    $bwg.Write([uint16]1)
    $bwg.Write([uint16]$entries.Count)
    for ($i = 0; $i -lt $entries.Count; $i++) {
        $e = $entries[$i]
        $bwg.Write([byte]$e.Width); $bwg.Write([byte]$e.Height)
        $bwg.Write([byte]$e.ColorCount); $bwg.Write([byte]$e.Reserved)
        $bwg.Write([uint16]$e.Planes); $bwg.Write([uint16]$e.Bpp)
        $bwg.Write([uint32]$e.Bytes)
        $bwg.Write([uint16]$newIds[$i])
    }
    $grpBytes = $msG.ToArray()

    # Overwrite every existing group-icon id with the same new artwork.
    foreach ($gid in $existingGroupIds) {
        $ok = [Zekoro.IconUpdater]::UpdateResourceW(
            $hUpd, $RT_GROUP_ICON, [IntPtr][int]$gid, 0, $grpBytes, [uint32]$grpBytes.Length)
        if (-not $ok) {
            throw "UpdateResource(RT_GROUP_ICON id=$gid) failed (LastError = $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
        }
    }

    if (-not [Zekoro.IconUpdater]::EndUpdateResourceW($hUpd, $false)) {
        throw "EndUpdateResource failed (LastError = $([System.Runtime.InteropServices.Marshal]::GetLastWin32Error()))"
    }
    $hUpd = [IntPtr]::Zero
} finally {
    if ($hUpd -ne [IntPtr]::Zero) {
        # Discard any partial work if we threw mid-flight.
        [void][Zekoro.IconUpdater]::EndUpdateResourceW($hUpd, $true)
    }
}

Write-Host "OK: branded $Target with $IconPng" -ForegroundColor Green
