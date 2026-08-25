$key = $env:SUPABASE_SERVICE_ROLE_KEY
$projectUrl = $env:SUPABASE_URL
if (-not $key -or -not $projectUrl) { throw "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." }
$h = @{ "Authorization" = "Bearer $key"; "apikey" = $key }
$base = "$($projectUrl.TrimEnd('/'))/rest/v1"

# Search Taroudant variants: taro, taroud
Write-Host "=== coliaty_cities contenant 'taro' ==="
$r = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*taro*&select=id,name&order=name" -Headers $h -UseBasicParsing
$r.Content | ConvertFrom-Json | ForEach-Object { Write-Host "  id=$($_.id)  name=$($_.name)" }

Write-Host ""
Write-Host "=== coliaty_cities contenant 'taroud' ==="
$r2 = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*taroud*&select=id,name&order=name" -Headers $h -UseBasicParsing
$r2.Content | ConvertFrom-Json | ForEach-Object { Write-Host "  id=$($_.id)  name=$($_.name)" }

Write-Host ""
Write-Host "=== coliaty_cities contenant 'tarodd' OR 'taroudan' ==="
$r3 = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*taroud*&select=id,name" -Headers $h -UseBasicParsing
Write-Host $r3.Content

Write-Host ""
Write-Host "=== coliaty_cities contenant 'ouarzaz' ==="
$r4 = Invoke-WebRequest -Uri "$base/coliaty_cities?name=ilike.*ouarzaz*&select=id,name&order=name" -Headers $h -UseBasicParsing
$r4.Content | ConvertFrom-Json | ForEach-Object { Write-Host "  id=$($_.id)  name=$($_.name)" }
