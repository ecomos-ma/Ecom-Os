$body = @{
    reference = "BRM-260726-3585-73-640"
    parcel_codes = @("AZM04263480BD", "afr07264153ZT", "CSA07269939WB", "CSA07264413PF")
} | ConvertTo-Json -Depth 3

curl -X POST "https://wxfialbmyfkafobtkrde.supabase.co/functions/v1/coliaty-api/add-parcels-to-pickup-note" `
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4ZmlhbGJteWZrYWZvYnRrcmRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjE5NzY0NDksImV4cCI6MjAzNzU1MjQ0OX0.3X4Z8Q9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9X9" `
  -H "Content-Type: application/json" `
  -d $body
