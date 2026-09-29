# Ghép ảnh thu nhỏ thành các tấm 5x4 có số thứ tự (số = vị trí dòng trong anh.txt)
# Dùng: ghep.ps1 <anh.txt> <thu-muc-ra> [moi-to]
param([string]$DanhSach, [string]$Ra, [int]$MoiTo = 20)
Add-Type -AssemblyName System.Drawing
$files = Get-Content -LiteralPath $DanhSach -Encoding UTF8 | Where-Object { $_ }
$C = 5; $R = [math]::Ceiling($MoiTo / $C); $W = 320; $H = 240
$font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
for ($s = 0; $s -lt $files.Count; $s += $MoiTo) {
  $bmp = New-Object System.Drawing.Bitmap ($W * $C), ($H * $R)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::White)
  $g.InterpolationMode = 'HighQualityBicubic'
  for ($k = 0; $k -lt $MoiTo -and ($s + $k) -lt $files.Count; $k++) {
    $x = ($k % $C) * $W; $y = [math]::Floor($k / $C) * $H
    try {
      $img = [System.Drawing.Image]::FromFile($files[$s + $k])
      $sc = [math]::Min(($W - 4) / $img.Width, ($H - 4) / $img.Height)
      $w2 = [int]($img.Width * $sc); $h2 = [int]($img.Height * $sc)
      $g.DrawImage($img, $x + [int](($W - $w2) / 2), $y + [int](($H - $h2) / 2), $w2, $h2)
      $img.Dispose()
    } catch {}
    $g.FillRectangle([System.Drawing.Brushes]::Black, $x + 3, $y + 3, 58, 28)
    $g.DrawString([string]($s + $k), $font, [System.Drawing.Brushes]::Yellow, $x + 5, $y + 3)
  }
  $bmp.Save((Join-Path $Ra ("to-{0:D3}.jpg" -f ($s / $MoiTo))), [System.Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose(); $bmp.Dispose()
}
