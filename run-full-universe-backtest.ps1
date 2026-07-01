$symbolsUrl = "https://namek-trading.gurpreetramdev2004.workers.dev/symbols-full"
$backtestUrl = "https://namek-trading.gurpreetramdev2004.workers.dev/daily-picks-filter-test-filtered"
$batchSize = 1
$totalTrades = 0
$totalWins = 0
$totalLosses = 0
$totalSampleSize = 0
$errorBatches = 0

Write-Host "Fetching full NSE symbol list once..."
$symbolsResponse = Invoke-RestMethod -Uri $symbolsUrl -Method Get -TimeoutSec 60
$allSymbols = $symbolsResponse.symbols
$count = $allSymbols.Count
Write-Host "Got $count symbols. Running backtest in batches of $batchSize."
Write-Host ""

$totalBatches = [math]::Ceiling($count / $batchSize)
$batchNum = 0
$i = 0

while ($i -lt $count) {
    $batch = $allSymbols[$i..([math]::Min($i + $batchSize - 1, $count - 1))]
    $encodedSymbols = ($batch | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join ","
    $url = $backtestUrl + "?symbols=" + $encodedSymbols
    $response = $null

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 60
    } catch {
        Write-Host "Batch $batchNum failed. URL was:"
        Write-Host $url
        Write-Host "Error detail: $($_.Exception.Message)"
        Write-Host "Retrying in 5s"
        Start-Sleep -Seconds 5
        try {
            $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 60
        } catch {
            Write-Host "Batch $batchNum failed again, skipping (likely exceeded the 10ms free-tier CPU limit for this stock)."
            $errorBatches = $errorBatches + 1
            $batchNum = $batchNum + 1
            $i = $i + $batchSize
            Start-Sleep -Milliseconds 500
            continue
        }
    }

    if ($response.error) {
        Write-Host "Batch $batchNum returned an error, skipping"
        $errorBatches = $errorBatches + 1
        $batchNum = $batchNum + 1
        $i = $i + $batchSize
        Start-Sleep -Milliseconds 500
        continue
    }

    $pr = $response.dailyTopPicksExactFilter
    $totalTrades = $totalTrades + $pr.totalTrades
    $totalWins = $totalWins + $pr.wins
    $totalLosses = $totalLosses + $pr.losses
    $totalSampleSize = $totalSampleSize + $pr.sampleSize

    Write-Host "Batch $batchNum of $totalBatches done. This batch trades: $($pr.totalTrades) wins: $($pr.wins). Running total trades: $totalTrades wins: $totalWins"

    $batchNum = $batchNum + 1
    $i = $i + $batchSize
    Start-Sleep -Milliseconds 800
}

Write-Host ""
Write-Host "FULL UNIVERSE BACKTEST FINAL AGGREGATE"
Write-Host "Stocks with valid trades: $totalSampleSize"
Write-Host "Total trades: $totalTrades"
Write-Host "Wins: $totalWins"
Write-Host "Losses: $totalLosses"

if ($totalTrades -gt 0) {
    $winRate = [math]::Round(($totalWins / $totalTrades) * 100, 2)
    $ev = [math]::Round((($totalWins / $totalTrades) * 2) + (($totalLosses / $totalTrades) * -1), 2)
    Write-Host "Win Rate: $winRate percent"
    Write-Host "Expected Value per trade: $ev R"
} else {
    Write-Host "No trades recorded, check for errors above."
}

if ($errorBatches -gt 0) {
    Write-Host ""
    Write-Host "Number of batches that failed and were skipped: $errorBatches"
}