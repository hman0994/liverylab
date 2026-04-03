@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "baseUrl=http://localhost:32034/pk_car.png?size=2&carPath=toyotagr86&number=34&carCustPaint="
set "scanDir=%cd%"

if not "%~1"=="" (
	if exist "%~1\" (
		for %%I in ("%~1") do set "scanDir=%%~fI"
		goto pickFromFolder
	)

	if exist "%~1" (
		for %%I in ("%~1") do set "selectedFullPath=%%~fI"
		goto openSelected
	)

	echo Argument not found: %~1
	exit /b 1
)

:pickFromFolder
set "count=0"
echo.
echo Looking for .tga files in:
echo %scanDir%
echo.

set "LL_SCAN_DIR=%scanDir%"
for /f "usebackq delims=" %%F in (`powershell -NoProfile -Command "Get-ChildItem -LiteralPath $env:LL_SCAN_DIR -Filter '*.tga' -File | Sort-Object LastWriteTime -Descending | ForEach-Object { $_.FullName }"`) do (
	set /a count+=1
	set "file[!count!]=%%~fF"
	for %%N in ("%%~fF") do echo   !count!. %%~nxN
)
set "LL_SCAN_DIR="

if !count! equ 0 (
	echo No .tga files were found in this folder.
	echo Run this script from the iRacing paint folder, pass a folder path, or drag a .tga onto it.
	exit /b 1
)

echo.
set /p "choice=Select a file number to preview, press Enter for 1, or press Q to quit: "

if "!choice!"=="" set "choice=1"

if /i "!choice!"=="Q" exit /b 0

for /f "delims=0123456789" %%A in ("!choice!") do (
	if not "%%A"=="" goto invalidChoice
)

if not defined file[!choice!] goto invalidChoice

call set "selectedFullPath=%%file[!choice!]%%"

:openSelected
if not defined selectedFullPath (
	echo No file was selected.
	exit /b 1
)

set "LL_SELECTED_TGA=%selectedFullPath%"
for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "[uri]::EscapeDataString($env:LL_SELECTED_TGA)"`) do set "encodedPath=%%U"
set "LL_SELECTED_TGA="

if not defined encodedPath (
	echo Failed to encode the selected file path.
	exit /b 1
)

set "previewUrl=%baseUrl%%encodedPath%"

echo.
echo Selected file:
echo %selectedFullPath%
echo.
echo Opening:
echo %previewUrl%
echo.

start "" "%previewUrl%"
exit /b 0

:invalidChoice
echo Invalid selection.
exit /b 1