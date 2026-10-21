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
  battle_record?: BattleRecord;
}

export interface BattleRecord {
  played: number;
  won: number;
  lost: number;
  drawn: number;
}

export interface BattlePlayer {
  id: string;
  name: string;
  username?: string;
  photo_url?: string;
}

export type BattleStatus = 'pending' | 'active' | 'completed' | 'declined' | 'expired';

export interface Battle {
  id: string;
  status: BattleStatus;
  challenger: BattlePlayer | null;
  opponent: BattlePlayer | null;
  challenger_score: number;
  opponent_score: number;
  my_score: number;
  their_score: number;
  winner_id?: string | null;
  coins_awarded: number;
  challenged_at: string;
  started_at?: string | null;
  expires_at?: string | null;
  completed_at?: string | null;
  is_challenger: boolean;
  can_respond: boolean;
}

export interface BattleSummary {
  pending_incoming: number;
  pending_outgoing: number;
  active: number;
  unread_count: number;
}

export interface TelegramLoginResponse extends User {
  access_token?: string;
  welcome_bonus_awarded: boolean;
}

// Quiz Data
export type QuizType = 'multiple_choice' | 'image_text';
export type QuestionType = 'multiple_choice' | 'image_text';

export interface Quiz {
  id: string;
  name: string;
  description?: string;
  quiz_type?: QuizType;
  total_questions: number;
  time_limit_seconds: number;
  points_per_question: number;
  total_points: number;
  cost_in_footy_coins: number;
  expires_at: string;
  scheduled_for?: string;
  destination?: 'game' | 'tournament';
  tournament_id?: string;
  tournament_gameweek?: number;
  created_at: string;
  questions?: Question[];
  already_played?: boolean;
}

export type TournamentType = 'league' | 'group_knockout';
export type TournamentStatus = 'registration' | 'starting' | 'cancelling' | 'active' | 'completed' | 'draft' | 'cancelled' | 'renewal';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  tournament_type: TournamentType;
  entry_fee: number;
  place_rewards?: Record<string, number>;
  max_players: number;
  registered_count: number;
  season?: number;
  start_at: string;
  status: TournamentStatus;
  total_gameweeks: number;
  winner_user_ids: string[];
  registered?: boolean;
  available?: boolean;
  unanswered_quiz_count?: number;
}

export interface TournamentRenewal {
  tournament_id: string;
  tournament_name: string;
  start_at: string;
  entry_fee: number;
}

export interface TournamentPlayer {
  id: string;
  name: string;
  photo_url?: string;
}

export interface TournamentFixture {
  id: string;
  gameweek: number;
  stage?: 'league' | 'group' | 'knockout';
  group_name?: string | null;
  round_name?: string | null;
  leg?: number;
  bracket_slot?: number | null;
  tiebreak_method?: string | null;
  scheduled_at: string | null;
  closes_at: string | null;
  status: 'scheduled' | 'completed' | 'bye' | 'pending';
  result?: 'win' | 'draw' | 'forfeit' | 'bye' | null;
  winner_user_id?: string | null;
  player: TournamentPlayer | null;
  opponent: TournamentPlayer | null;
  player_score: number | null;
  opponent_score: number | null;
  player_submitted: boolean;
  opponent_submitted: boolean;
}

export interface TournamentGroup {
  name: string;
  standings: TournamentStanding[];
}

export interface TournamentBracketRound {
  name: string;
  gameweek: number;
  fixtures: TournamentFixture[];
}

export interface TournamentStanding {
  user_id: string;
  name: string;
  photo_url?: string;
  group_name?: string;
  rank: number;
  points: number;
  matches_played: number;
  gameweeks_played: number;
  wins: number;
  draws: number;
  losses: number;
  points_for: number;
  points_against: number;
  point_difference: number;
}

export interface Question {
  id: string;
  quiz_id?: string;
  question_text: string;
  question_type?: QuestionType;
  image_url?: string;
  correct_answer_text?: string;
  options: Option[];
  correct_option_id?: string;
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
  gameweek?: number;
  answers: UserAnswer[];
  total_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  points_earned: number;
  leaderboard_bonus?: number;
  leaderboard_boosted_at?: string | null;
  leaderboard_booster?: {
    available: boolean;
    uses_remaining: number;
    bonus_points: number;
  };
  accuracy_rate: number;
  completed_at: string;
  time_taken_seconds: number;
}

export interface UserAnswer {
  question_id: string;
  selected_option_id?: string;
  answer_text?: string;
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
  max_members?: number | null;
  total_game_weeks?: number;
  current_game_week?: number;
  start_date?: string;
  end_date?: string;
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
  name?: string;
  description?: string;
  is_private?: boolean;
  code?: string;
  total_members?: number;
  max_members?: number | null;
  start_date?: string;
  end_date?: string;
}

export interface LeagueRanking {
  user_id: string;
  username: string;
  rank: number;
  points: number;
  user: User;
}

export interface LeagueWinNotification {
  id: string;
  league_id: string;
  league_name: string;
  season: number;
  awarded_at: string;
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
  type: 'watch_ads' | 'join_telegram' | 'join_announcement';
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
