@echo off
chcp 65001
cd /d "%~dp0"
start http://localhost:3095
npm run dev
