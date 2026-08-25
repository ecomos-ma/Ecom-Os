$key = $env:SUPABASE_SERVICE_ROLE_KEY
$projectUrl = $env:SUPABASE_URL
if (-not $key -or -not $projectUrl) { throw "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." }
$h = @{ "Authorization" = "Bearer $key"; "Content-Type" = "application/json" }
$base = "$($projectUrl.TrimEnd('/'))/functions/v1/coliaty-api"

function Invoke-EdgeFunction {
    param([string]$Uri, [string]$Method = "GET", [string]$Body = $null)
    try {
        $params = @{
            Uri             = $Uri
            Method          = $Method
            Headers         = $h
            UseBasicParsing = $true
            TimeoutSec      = 30
        }
        if ($Body) { $params.Body = $Body }
        $r = Invoke-WebRequest @params
        Write-Host "STATUS: $($r.StatusCode)"
        Write-Host $r.Content
    } catch {
        $ex = $_.Exception
        Write-Host "HTTP ERROR: $($ex.Message)"
        if ($ex.Response) {
            $stream = $ex.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            Write-Host "BODY: $($reader.ReadToEnd())"
        }
    }
}

Write-Host "=== STEP 1: city-info for Ouarzazat (id=8396) ==="
Invoke-EdgeFunction -Uri "${base}?action=city-info&city_id=8396"
Write-Host ""

Write-Host "=== STEP 2: insert-city-mapping (59 rows) ==="

$mappings = @(
  @{ arabic_name_row_id = 90;  coliaty_city_id = 6794 },
  @{ arabic_name_row_id = 91;  coliaty_city_id = 6794 },
  @{ arabic_name_row_id = 135; coliaty_city_id = 6794 },
  @{ arabic_name_row_id = 92;  coliaty_city_id = 8336 },
  @{ arabic_name_row_id = 93;  coliaty_city_id = 8336 },
  @{ arabic_name_row_id = 94;  coliaty_city_id = 8336 },
  @{ arabic_name_row_id = 95;  coliaty_city_id = 7172 },
  @{ arabic_name_row_id = 96;  coliaty_city_id = 7274 },
  @{ arabic_name_row_id = 97;  coliaty_city_id = 7274 },
  @{ arabic_name_row_id = 102; coliaty_city_id = 8054 },
  @{ arabic_name_row_id = 103; coliaty_city_id = 7256 },
  @{ arabic_name_row_id = 104; coliaty_city_id = 7256 },
  @{ arabic_name_row_id = 105; coliaty_city_id = 7202 },
  @{ arabic_name_row_id = 106; coliaty_city_id = 7202 },
  @{ arabic_name_row_id = 110; coliaty_city_id = 8582 },
  @{ arabic_name_row_id = 111; coliaty_city_id = 7532 },
  @{ arabic_name_row_id = 112; coliaty_city_id = 7520 },
  @{ arabic_name_row_id = 114; coliaty_city_id = 7052 },
  @{ arabic_name_row_id = 115; coliaty_city_id = 7112 },
  @{ arabic_name_row_id = 116; coliaty_city_id = 7112 },
  @{ arabic_name_row_id = 129; coliaty_city_id = 7112 },
  @{ arabic_name_row_id = 122; coliaty_city_id = 6866 },
  @{ arabic_name_row_id = 123; coliaty_city_id = 6908 },
  @{ arabic_name_row_id = 124; coliaty_city_id = 8288 },
  @{ arabic_name_row_id = 125; coliaty_city_id = 6836 },
  @{ arabic_name_row_id = 133; coliaty_city_id = 8771 },
  @{ arabic_name_row_id = 107; coliaty_city_id = 7082 },
  @{ arabic_name_row_id = 108; coliaty_city_id = 7082 },
  @{ arabic_name_row_id = 109; coliaty_city_id = 8498 },
  @{ arabic_name_row_id = 77;  coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 78;  coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 79;  coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 80;  coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 81;  coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 82;  coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 126; coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 127; coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 128; coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 130; coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 132; coliaty_city_id = 7028 },
  @{ arabic_name_row_id = 83;  coliaty_city_id = 7166 },
  @{ arabic_name_row_id = 131; coliaty_city_id = 7166 },
  @{ arabic_name_row_id = 84;  coliaty_city_id = 7322 },
  @{ arabic_name_row_id = 85;  coliaty_city_id = 7322 },
  @{ arabic_name_row_id = 86;  coliaty_city_id = 7322 },
  @{ arabic_name_row_id = 87;  coliaty_city_id = 7982 },
  @{ arabic_name_row_id = 134; coliaty_city_id = 7982 },
  @{ arabic_name_row_id = 88;  coliaty_city_id = 6788 },
  @{ arabic_name_row_id = 89;  coliaty_city_id = 6788 },
  @{ arabic_name_row_id = 98;  coliaty_city_id = 6602 },
  @{ arabic_name_row_id = 99;  coliaty_city_id = 6602 },
  @{ arabic_name_row_id = 100; coliaty_city_id = 6602 },
  @{ arabic_name_row_id = 101; coliaty_city_id = 6602 },
  @{ arabic_name_row_id = 117; coliaty_city_id = 8396 },
  @{ arabic_name_row_id = 120; coliaty_city_id = 8156 },
  @{ arabic_name_row_id = 121; coliaty_city_id = 8156 },
  @{ arabic_name_row_id = 113; coliaty_city_id = 8354 },
  @{ arabic_name_row_id = 119; coliaty_city_id = 8522 },
  @{ arabic_name_row_id = 118; coliaty_city_id = 6716 }
)

Write-Host "Total mappings to insert: $($mappings.Count)"
$body = @{ mappings = $mappings } | ConvertTo-Json -Depth 5
Invoke-EdgeFunction -Uri "${base}?action=insert-city-mapping" -Method POST -Body $body
