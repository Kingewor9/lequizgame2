@echo off
REM Frontend setup
cd frontend
echo Installing frontend dependencies...
call npm install

REM Create .env file
echo VITE_API_BASE_URL=http://localhost:8000/api > .env
echo VITE_TELEGRAM_BOT_TOKEN=your_telegram_bot_token >> .env

echo Frontend setup complete!
echo.

REM Backend setup
cd ..\backend
echo Setting up backend...

REM Create virtual environment
python -m venv venv

REM Activate virtual environment
call venv\Scripts\activate

REM Install dependencies
echo Installing backend dependencies...
pip install -r requirements.txt

REM Create .env file
(
echo FLASK_ENV=development
echo FLASK_APP=run.py
echo SECRET_KEY=your-secret-key-change-in-production
echo JWT_SECRET_KEY=your-jwt-secret-key-change-in-production
echo DATABASE_URL=sqlite:///footy_iq.db
echo TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
echo FLASK_DEBUG=1
echo PORT=8000
) > .env

echo Backend setup complete!
echo.
echo To start development:
echo 1. Frontend: cd frontend && npm run dev
echo 2. Backend: cd backend && python run.py
pause
