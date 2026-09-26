@echo off
echo [1/3] Creating virtual environment...
python -m venv venv

echo [2/3] Activating and installing dependencies...
call venv\Scripts\activate.bat
pip install -r requirements.txt

echo [3/3] Done! To start the server run:
echo   venv\Scripts\activate.bat
echo   uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
