#!/bin/bash

# Frontend setup
cd frontend
echo "Installing frontend dependencies..."
npm install

# Create .env file
echo "VITE_API_BASE_URL=http://localhost:8000/api
VITE_TELEGRAM_BOT_TOKEN=your_telegram_bot_token" > .env

echo "Frontend setup complete!"
echo ""

# Backend setup
cd ../backend
echo "Setting up backend..."

# Check if Python is installed
if ! command -v python &> /dev/null; then
    echo "Python is not installed. Please install Python 3.8+"
    exit 1
fi

# Create virtual environment
python -m venv venv

# Activate virtual environment
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" ]]; then
    source venv/Scripts/activate
else
    source venv/bin/activate
fi

# Install dependencies
echo "Installing backend dependencies..."
pip install -r requirements.txt

# Create .env file
echo "FLASK_ENV=development
FLASK_APP=run.py
SECRET_KEY=your-secret-key-change-in-production
JWT_SECRET_KEY=your-jwt-secret-key-change-in-production
DATABASE_URL=sqlite:///footy_iq.db
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
FLASK_DEBUG=1
PORT=8000" > .env

echo "Backend setup complete!"
echo ""
echo "To start development:"
echo "1. Frontend: cd frontend && npm run dev"
echo "2. Backend: cd backend && python run.py"
