param(
    [string]$Source = "desktop/renderer/assets/images/live-flow-app-icon.png",
    [string]$Output = "desktop/assets/liveflow.ico"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourcePath = [System.IO.Path]::GetFullPath((Join-Path $root $Source))
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $root $Output))
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$images = @()

try {
    foreach ($size in $sizes) {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.DrawImage($sourceImage, 0, 0, $size, $size)
        } finally {
            $graphics.Dispose()
        }
        $memory = New-Object System.IO.MemoryStream
        $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
        $bitmap.Dispose()
        $images += ,$memory.ToArray()
        $memory.Dispose()
    }
} finally {
    $sourceImage.Dispose()
}

$stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$writer = New-Object System.IO.BinaryWriter($stream)
try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$images.Count)
    $offset = 6 + (16 * $images.Count)
    for ($index = 0; $index -lt $images.Count; $index++) {
        $size = $sizes[$index]
        $writer.Write([Byte]($(if ($size -eq 256) { 0 } else { $size })))
        $writer.Write([Byte]($(if ($size -eq 256) { 0 } else { $size })))
        $writer.Write([Byte]0)
        $writer.Write([Byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$images[$index].Length)
        $writer.Write([UInt32]$offset)
        $offset += $images[$index].Length
    }
    foreach ($image in $images) {
        $writer.Write($image)
    }
} finally {
    $writer.Dispose()
    $stream.Dispose()
}

Write-Output "Generated $outputPath with sizes: $($sizes -join ', ')"
