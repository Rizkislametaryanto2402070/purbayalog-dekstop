@echo off
setlocal
REM Build PurbayaLog (Tauri v2) di Windows. Jalankan dari folder proyek.
where node >nul 2>nul || (echo [GALAT] Node.js belum terpasang. Pasang LTS dari https://nodejs.org & exit /b 1)
where cargo >nul 2>nul || (echo [GALAT] Rust/Cargo belum terpasang. Pasang dari https://rustup.rs & exit /b 1)
echo [1/3] Menjalankan pengujian logika (Node)...
call npm install || exit /b 1
call npm run test || (echo [GALAT] Pengujian Node gagal & exit /b 1)
echo [2/3] Menjalankan pengujian inti Rust...
call npm run test:rust || (echo [GALAT] Pengujian Rust gagal & exit /b 1)
echo [3/3] Membangun aplikasi (pertama kali bisa 5-15 menit)...
call npm run tauri build || exit /b 1
echo.
echo Selesai. Installer: src-tauri\target\release\bundle\  (nsis\*.exe dan msi\*.msi)
echo Program langsung: src-tauri\target\release\purbayalog.exe
endlocal
