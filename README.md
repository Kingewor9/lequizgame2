# Footy IQ - Football Quiz Telegram Mini App

A Telegram mini app for daily football quizzes with leagues, tournaments, and rewards system.

## Project Structure

### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **API Client**: Axios
- **Styling**: CSS3

### Backend
- **Framework**: Flask (Python)
- **Database**: SQLAlchemy with SQLite (local) or PostgreSQL (production)
- **Authentication**: JWT (JSON Web Tokens)
- **API Style**: RESTful

## Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create `.env` file:
```bash
VITE_API_BASE_URL=http://localhost:8000/api
VITE_TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

4. Start development server:
```bash
npm run dev
```

## Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file:
```bash
FLASK_ENV=development
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
DATABASE_URL=sqlite:///footy_iq.db
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

5. Run migrations (if using Flask-Migrate):
```bash
flask db upgrade
```

6. Start development server:
```bash
python run.py
```

The API will be available at `http://localhost:8000`

## Features

### Home Page
- Welcome message with user's Telegram name
- Today's Quiz card with countdown timer
- Overall score and global leaderboard ranking
- Quiz gameplay with timer and instant feedback
- Results display with accuracy and points earned

### League Page
- Create new leagues (public or private with 6-digit codes)
- Join leagues using codes
- View user's leagues with personal ranking and points
- Search and discover public leagues
- League details and member rankings

### Tournament Page
- Coming soon banner for future tournaments
- Teaser for cash rewards and weekly competitions

### Footy Coins Page
- Display current balance
- Earn coins through tasks:
  - Watch ads (100 coins)
  - Claim free bonus (250 coins)
  - Join Telegram channel (150 coins)
- Track completed tasks

## API Endpoints

### Authentication
- `POST /api/auth/telegram-login` - Login with Telegram data
- `POST /api/auth/logout` - Logout user

### Quizzes
- `GET /api/quizzes/today` - Get today's quiz
- `GET /api/quizzes/<id>` - Get full quiz with questions
- `POST /api/quizzes/<id>/submit` - Submit quiz answers

### Leagues
- `POST /api/leagues` - Create new league
- `GET /api/leagues/user` - Get user's leagues
- `GET /api/leagues/public` - Get public leagues
- `GET /api/leagues/search` - Search leagues
- `POST /api/leagues/join` - Join league with code

### Users
- `GET /api/users/<id>` - Get user profile
- `POST /api/users/spend-coins` - Spend footy coins
- `GET /api/users/<id>/leaderboard` - Get global leaderboard

### Footy Coins
- `GET /api/footy-coins/tasks` - Get available tasks
- `POST /api/footy-coins/tasks/<id>/complete` - Complete a task
- `GET /api/footy-coins/balance` - Get coin balance

## Database Models

### User
- Telegram ID, name, username, photo
- Overall score, global rank
- Footy coins balance
- Relationships with quizzes, leagues, transactions

### Quiz
- Name, description, questions
- Time limit, points, cost in coins
- Expiration date
- Questions with options

### League
- Name, description, privacy setting
- 6-digit code for private leagues
- Members and rankings

### Footy Coin Tasks
- Watch ads, free claim, join Telegram
- Reward amounts
- User completion tracking

## Styling

The app uses a **black and white theme** with:
- Dark background (#000)
- Light text (#fff)
- Accent colors for success (#51cf66), error (#ff6b6b), and warnings
- Responsive design for mobile devices
- Smooth animations and transitions

## Development Notes

- No mock data - all data comes from the backend
- Telegram Web App SDK used for authentication
- Vibration feedback for quiz answers (success/error)
- Countdown timers for quizzes and league expirations
- JWT tokens for authenticated API requests

## Environment Variables

### Frontend (.env)
```
VITE_API_BASE_URL=http://localhost:8000/api
VITE_TELEGRAM_BOT_TOKEN=your_token
```

### Backend (.env)
```
FLASK_ENV=development
SECRET_KEY=your-secret-key
JWT_SECRET_KEY=your-jwt-secret
DATABASE_URL=sqlite:///footy_iq.db
TELEGRAM_BOT_TOKEN=your_token
```

## Deployment

### Frontend
- Build: `npm run build`
- Deploy static files to Vercel, Netlify, or any static host
- Set `VITE_API_BASE_URL` to production API URL

### Backend
- Deploy to Heroku, AWS, DigitalOcean, or any Python-capable host
- Use PostgreSQL for production database
- Set environment variables on host platform

## License

Proprietary - All rights reserved
