@echo off
cd /d "C:\Users\Ron Dixon\Desktop\SONIC DESIGN STUDIO"
git add -A
git commit -m "fix: audit pass - 40+ bugs fixed, real exports, project save/open, working tools (see AUDIT_TRAIL.md)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014ncEBm3AKi9NSydbfoKfth"
git remote get-url origin >nul 2>&1 || git remote add origin https://github.com/PapiSlimm/V12-SonicDesign.git
git branch -M main
git push -u origin main
pause
