# Script para arreglar el regex de hover images en ProductCard.tsx

$filePath = "src\components\ProductCard.tsx"
$content = Get-Content $filePath -Raw

# Reemplazar el regex antiguo por el nuevo que soporta sufijos de WordPress
$oldPattern = 'if \(mainImage\.src\.match\(/\[-_\]1\\\\\.\(jpg\|jpeg\|png\|webp\)\$/i\)\) \{'
$newPattern = 'if (mainImage.src.match(/[-_]1(-e\\d+)?\\.(jpg|jpeg|png|webp)$/i)) {'

$content = $content -replace [regex]::Escape($oldPattern), $newPattern

# Reemplazar el replace también
$oldReplace = "return mainImage\.src\.replace\(/\(\[-_\]\)1\(\\\\\.\(\?:jpg\|jpeg\|png\|webp\)\)\$/i, '\$12\$2'\);"
$newReplace = "return mainImage.src.replace(/([-_])1((?:-e\\d+)?\\.(?:jpg|jpeg|png|webp))$/i, '`$1'+'2'+''`$2'');"

$content = $content -replace [regex]::Escape($oldReplace), $newReplace

$content | Set-Content $filePath -NoNewline

Write-Host "✅ Archivo actualizado correctamente"
