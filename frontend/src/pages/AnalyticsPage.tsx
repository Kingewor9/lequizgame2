import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CircleCheck,
  CirclePlay,
  Clock3,
  Layers3,
  RefreshCw,
  UserPlus,
  Users,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Alert } from '../components/Alert';
import { Loading } from '../components/Loading';
import { apiService } from '../services/apiService';
import '../styles/pages/AnalyticsPage.css';

interface Analytics {
  generated_at: string;
  total_players: number;
  daily_active_users: number;
  new_users_today: number;
  league_members_joined_today: number;
  total_league_memberships: number;
  leagues_created: number;
  league_creators: number;
  leagues_created_today: number;
  active_quizzes: number;
  quiz_players_today: number;
  quiz_starts_today: number;
  quiz_completions_today: number;
  quiz_completion_rate: number;
}

interface Metric {
  label: string;
  value: number | string;
  detail: string;
  icon: LucideIcon;
  tone: 'emerald' | 'amber' | 'sky' | 'indigo';
  period: 'TODAY' | 'ALL TIME' | 'LIVE';
}

interface Props {
  onBack: () => void;
}

const numberFormat = new Intl.NumberFormat();

export const AnalyticsPage: React.FC<Props> = ({ onBack }) => {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async (background = false) => {
    if (background) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const response = await apiService.get<Analytics>('/admin/analytics');
      if (response.success && response.data) {
        setAnalytics(response.data);
      } else {
        setError(response.error || 'Could not load game analytics.');
      }
    } catch (requestError) {
      console.error('Error loading game analytics:', requestError);
      setError('Network error while loading analytics. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAnalytics();
    const refreshTimer = window.setInterval(() => {
      void loadAnalytics(true);
    }, 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [loadAnalytics]);

  if (isLoading) {
    return <Loading message="Loading game analytics..." />;
  }

  const metrics: Metric[] = analytics ? [
    {
      label: 'Total players',
      value: numberFormat.format(analytics.total_players),
      detail: 'Registered accounts',
      icon: UsersRound,
      tone: 'emerald',
      period: 'ALL TIME',
    },
    {
      label: 'Daily active players',
      value: numberFormat.format(analytics.daily_active_users),
      detail: 'Launched the app or played a quiz today',
      icon: Activity,
      tone: 'sky',
      period: 'TODAY',
    },
    {
      label: 'New players today',
      value: numberFormat.format(analytics.new_users_today),
      detail: 'Accounts created today',
      icon: UserPlus,
      tone: 'amber',
      period: 'TODAY',
    },
    {
      label: 'League joins today',
      value: numberFormat.format(analytics.league_members_joined_today),
      detail: `${numberFormat.format(analytics.total_league_memberships)} total memberships`,
      icon: Users,
      tone: 'indigo',
      period: 'TODAY',
    },
    {
      label: 'League creators',
      value: numberFormat.format(analytics.league_creators),
      detail: 'Players who own a league',
      icon: Layers3,
      tone: 'sky',
      period: 'ALL TIME',
    },
    {
      label: 'Leagues created',
      value: numberFormat.format(analytics.leagues_created),
      detail: `${numberFormat.format(analytics.leagues_created_today)} created today`,
      icon: Layers3,
      tone: 'emerald',
      period: 'ALL TIME',
    },
    {
      label: 'Quizzes live now',
      value: numberFormat.format(analytics.active_quizzes),
      detail: 'Published, available, and not expired',
      icon: CirclePlay,
      tone: 'amber',
      period: 'LIVE',
    },
    {
      label: 'Quiz players today',
      value: numberFormat.format(analytics.quiz_players_today),
      detail: `${numberFormat.format(analytics.quiz_starts_today)} quiz starts`,
      icon: BarChart3,
      tone: 'sky',
      period: 'TODAY',
    },
    {
      label: 'Quiz completion rate',
      value: `${analytics.quiz_completion_rate}%`,
      detail: 'Today’s starts completed so far',
      icon: CircleCheck,
      tone: 'emerald',
      period: 'TODAY',
    },
    {
      label: 'Quiz completions today',
      value: numberFormat.format(analytics.quiz_completions_today),
      detail: 'Submitted quiz results today',
      icon: CalendarDays,
      tone: 'indigo',
      period: 'TODAY',
    },
  ] : [];

  return (
    <main className="admin-page analytics-page">
      <header className="analytics-header">
        <button type="button" className="analytics-back" onClick={onBack}>
          <ArrowLeft size={17} />
          Admin panel
        </button>
        <div className="analytics-title-row">
          <div>
            <span className="admin-hub-kicker">CONTROL ROOM / INSIGHTS</span>
            <h1 className="admin-title">Game analytics</h1>
            <p className="admin-subtitle">
              A live read on your players, leagues, and quiz engagement.
            </p>
          </div>
          <button
            type="button"
            className="analytics-refresh"
            onClick={() => void loadAnalytics(true)}
            disabled={isRefreshing}
            aria-label="Refresh analytics"
          >
            <RefreshCw size={17} className={isRefreshing ? 'analytics-refresh-spinning' : ''} />
            <span>{isRefreshing ? 'Refreshing' : 'Refresh'}</span>
          </button>
        </div>
      </header>

      {error && <Alert message={error} type="error" onClose={() => setError(null)} />}

      {analytics && (
        <>
          <section className="analytics-pulse" aria-label="Today's player activity">
            <div className="analytics-pulse-mark"><Activity size={22} /></div>
            <div className="analytics-pulse-copy">
              <span>PLAYER PULSE / TODAY</span>
              <strong>{numberFormat.format(analytics.daily_active_users)} <small>active players</small></strong>
            </div>
            <p>
              {numberFormat.format(analytics.new_users_today)} new sign-ups
              <span aria-hidden="true"> · </span>
              {numberFormat.format(analytics.quiz_players_today)} played a quiz
            </p>
          </section>

          <section className="analytics-grid" aria-label="Game metrics">
            {metrics.map(({ label, value, detail, icon: Icon, tone, period }, index) => (
              <article
                className={`analytics-card analytics-card-${tone}`}
                key={label}
                style={{ animationDelay: `${index * 45}ms` }}
              >
                <div className="analytics-card-top">
                  <span className="analytics-card-icon"><Icon size={19} /></span>
                  <span className="analytics-card-period"><Clock3 size={12} /> {period}</span>
                </div>
                <strong className="analytics-card-value">{value}</strong>
                <span className="analytics-card-label">{label}</span>
                <span className="analytics-card-detail">{detail}</span>
              </article>
            ))}
          </section>

          <footer className="analytics-footnote">
            <span>Daily metrics use the UTC calendar day.</span>
            <span>
              Last updated {new Date(analytics.generated_at).toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
              {' · '}Auto-refreshes every minute
            </span>
          </footer>
        </>
      )}
    </main>
  );
};
