@echo off
setlocal
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=amd64 -host_arch=amd64 >nul
if errorlevel 1 exit /b 1
if not exist "%~dp0camera\build" mkdir "%~dp0camera\build"
pushd "%~dp0camera\build"
cl /nologo /LD /O2 /MT /W3 /GR- /D NDEBUG /D _WINDOWS /D _USRDLL /Fo./ "%~dp0camera\UnityCaptureFilter.cpp" "%~dp0camera\streams.cpp" /link /OUT:"%~dp0..\bin\MohivxCamera64.dll" /DEF:"%~dp0camera\UnityCaptureFilter.def" /guard:cf user32.lib gdi32.lib advapi32.lib ole32.lib oleaut32.lib uuid.lib strmiids.lib winmm.lib comctl32.lib
set mmCameraResult=%ERRORLEVEL%
popd
exit /b %mmCameraResult%
