// Telegram User Data
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  added_to_attachment_menu?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface TelegramWebAppInitData {
  user: TelegramUser;
  auth_date: number;
  hash: string;
  start_param?: string;
  can_send_after?: number;
}

// User Data
export interface User {
  id: string;
  telegram_id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  overall_score: number;
  global_rank: number;
  global_total_players: number;
  footy_coins: number;
  created_at: string;
  updated_at: string;
  is_admin?: boolean;
}

// Quiz Data
export interface Quiz {
  id: string;
  name: string;
  description?: string;
  total_questions: number;
  time_limit_seconds: number;
  points_per_question: number;
  total_points: number;
  cost_in_footy_coins: number;
  expires_at: string;
  created_at: string;
  questions?: Question[];
}

export interface Question {
  id: string;
  quiz_id: string;
  question_text: string;
  options: Option[];
  correct_option_id: string;
  order: number;
}

export interface Option {
  id: string;
  question_id: string;
  option_text: string;
  order: number;
}

// Quiz Response
export interface QuizResponse {
  id: string;
  user_id: string;
  quiz_id: string;
  answers: UserAnswer[];
  total_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  points_earned: number;
  accuracy_rate: number;
  completed_at: string;
  time_taken_seconds: number;
}

export interface UserAnswer {
  question_id: string;
  selected_option_id: string;
  is_correct: boolean;
}

// League Data
export interface League {
  id: string;
  name: string;
  description?: string;
  is_private: boolean;
  code?: string;
  creator_id: string;
  total_members: number;
  created_at: string;
  updated_at: string;
}

export interface UserLeague {
  id: string;
  user_id: string;
  league_id: string;
  league: League;
  rank: number;
  points: number;
  is_owner: boolean;
  joined_at: string;
}

export interface LeagueRanking {
  user_id: string;
  username: string;
  rank: number;
  points: number;
  user: User;
}

// Footy Coin Data
export interface FootyCoinTransaction {
  id: string;
  user_id: string;
  type: 'earned' | 'spent' | 'reward';
  amount: number;
  reason: string;
  created_at: string;
}

export interface FootyCoinTask {
  id: string;
  type: 'watch_ads' | 'free_claim' | 'join_telegram';
  title: string;
  description: string;
  reward_coins: number;
  is_completed: boolean;
  completed_at?: string;
}

// API Response
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message?: string;
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
