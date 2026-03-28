$pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue)?.Source
if (-not $pythonw) {
    # Fallback: find pythonw next to python.exe
    $python = (Get-Command python.exe).Source
    $pythonw = Join-Path (Split-Path $python) "pythonw.exe"
}

$WshShell  = New-Object -comObject WScript.Shell
$Shortcut  = $WshShell.CreateShortcut(
    [System.Environment]::GetFolderPath('Desktop') + "\Portfolio Tracker.lnk"
)
$Shortcut.TargetPath       = $pythonw
$Shortcut.Arguments        = "`"C:\Users\yxngh\Documents\portfolio_tracker\main.py`""
$Shortcut.WorkingDirectory = "C:\Users\yxngh\Documents\portfolio_tracker"
$Shortcut.IconLocation     = "shell32.dll,162"
$Shortcut.Save()

Write-Host "Shortcut updated on Desktop (no console window)."
