import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  Clock3,
  Coins,
  Medal,
  Search,
  Shield,
  Swords,
  Trophy,
  UserRound,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiService } from '../services/apiService';
import { Battle, BattlePlayer } from '../types';
import '../styles/pages/BattlePage.css';

interface Props {
  onBack: () => void;
  initialPlayerId?: string | null;
}

const formatCountdown = (expiresAt?: string | null, now = Date.now()) => {
  if (!expiresAt) return '--:--:--';
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const PlayerAvatar: React.FC<{ player: BattlePlayer | null; small?: boolean }> = ({
  player,
  small = false,
}) => (
  <span className={`battle-avatar${small ? ' battle-avatar-small' : ''}`}>
    {player?.photo_url ? (
      <img src={player.photo_url} alt="" />
    ) : (
      <UserRound size={small ? 16 : 21} aria-hidden="true" />
    )}
  </span>
);

export const BattlePage: React.FC<Props> = ({ onBack, initialPlayerId }) => {
  const { user, refreshUser } = useAuth();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [players, setPlayers] = useState<BattlePlayer[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const initializedChallenge = useRef(false);
  const seenCompletedBattles = useRef(new Set<string>());

  const loadBattles = useCallback(async () => {
    const response = await apiService.get<Battle[]>('/battles');
    if (!response.success) {
      setMessage(response.error || 'Could not load battles.');
      return;
    }
    setBattles(response.data || []);
  }, []);

  useEffect(() => {
    const unseenResults = battles.filter(
      (battle) => battle.status === 'completed' && !seenCompletedBattles.current.has(battle.id)
    );
    if (unseenResults.length === 0) return;
    unseenResults.forEach((battle) => seenCompletedBattles.current.add(battle.id));
    refreshUser().catch((error: unknown) => {
      console.error('Could not refresh Footy Coins after a 1v1 battle:', error);
    });
  }, [battles, refreshUser]);

  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      try {
        const response = await apiService.get<Battle[]>('/battles');
        if (!mounted) return;
        if (!response.success) throw new Error(response.error || 'Could not load battles.');
        setBattles(response.data || []);
        setMessage(null);
      } catch (error) {
        if (mounted) setMessage(error instanceof Error ? error.message : 'Could not load battles.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15000);
    const clock = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => {
    const searchQuery = query.trim();
    if (searchQuery.length < 2) {
      setPlayers([]);
      setSearching(false);
      return undefined;
    }

    let mounted = true;
    const timeout = window.setTimeout(async () => {
      setSearching(true);
      const response = await apiService.get<BattlePlayer[]>(
        `/battles/players?q=${encodeURIComponent(searchQuery)}`
      );
      if (mounted) {
        setPlayers(response.success ? response.data || [] : []);
        if (!response.success) setMessage(response.error || 'Could not search players.');
        setSearching(false);
      }
    }, 300);
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
    };
  }, [query]);

  const challengePlayer = useCallback(async (playerId: string) => {
    setPendingId(playerId);
    setMessage(null);
    try {
      const response = await apiService.post<Battle>('/battles', { opponent_id: playerId });
      if (!response.success) {
        setMessage(response.error || 'Could not send challenge.');
      } else {
        setMessage('Challenge sent. The 24-hour clock starts when they accept.');
        setQuery('');
        setPlayers([]);
        await loadBattles();
      }
    } finally {
      setPendingId(null);
    }
  }, [loadBattles]);

  useEffect(() => {
    if (initialPlayerId && !initializedChallenge.current) {
      initializedChallenge.current = true;
      void challengePlayer(initialPlayerId);
    }
  }, [challengePlayer, initialPlayerId]);

  const respond = async (battle: Battle, action: 'accept' | 'decline') => {
    setPendingId(battle.id);
    setMessage(null);
    try {
      const response = await apiService.post<Battle>(
        `/battles/${battle.id}/respond`,
        { action }
      );
      if (!response.success) {
        setMessage(response.error || 'Could not update this challenge.');
      } else {
        await loadBattles();
      }
    } finally {
      setPendingId(null);
    }
  };

  const activeBattles = battles.filter((battle) => battle.status === 'active');
  const incomingBattles = battles.filter(
    (battle) => battle.status === 'pending' && battle.can_respond
  );
  const outgoingBattles = battles.filter(
    (battle) => battle.status === 'pending' && !battle.can_respond
  );
  const completedBattles = battles.filter((battle) => battle.status === 'completed');
  const otherPlayer = (battle: Battle) => (
    battle.is_challenger ? battle.opponent : battle.challenger
  );

  return (
    <main className="battle-page animate-fade">
      <header className="battle-page-header">
        <button className="btn-back-nav" onClick={onBack} aria-label="Back to home">
          <ChevronLeft size={23} />
        </button>
        <div>
          <span className="battle-eyebrow">THE HEAD-TO-HEAD ARENA</span>
          <h1>1v1 Battle</h1>
        </div>
        <span className="battle-header-icon"><Swords size={21} /></span>
      </header>

      <section className="battle-intro">
        <div className="battle-intro-copy">
          <span className="battle-intro-kicker">24 HOURS. EVERY QUIZ COUNTS.</span>
          <h2>Settle it on the scoreboard.</h2>
          <p>Challenge a player. Main-game quiz points decide the winner.</p>
        </div>
        <div className="battle-reward-badge">
          <Coins size={18} />
          <strong>150</strong>
          <span>COINS TO WIN</span>
        </div>
        <div className="battle-rules-strip">
          <span><Trophy size={14} /> Win <b>150</b></span>
          <span><Shield size={14} /> Draw <b>75 each</b></span>
          <span><Clock3 size={14} /> Starts on acceptance</span>
        </div>
      </section>

      <section className="battle-search-panel">
        <div className="battle-section-heading">
          <div>
            <span className="battle-eyebrow">FIND YOUR RIVAL</span>
            <h2>Challenge a player</h2>
          </div>
          <Search size={19} />
        </div>
        <label className="battle-search-box">
          <Search size={17} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name or username"
            aria-label="Search players by name or username"
          />
          {searching && <span className="battle-search-spinner" aria-label="Searching" />}
        </label>
        {query.trim().length === 1 && (
          <p className="battle-search-hint">Type at least 2 characters to search.</p>
        )}
        {players.length > 0 && (
          <div className="battle-search-results">
            {players.map((player) => (
              <div className="battle-player-result" key={player.id}>
                <PlayerAvatar player={player} small />
                <div className="battle-player-copy">
                  <strong>{player.name || player.username || 'Football fan'}</strong>
                  <span>{player.username ? `@${player.username}` : 'Footy IQ player'}</span>
                </div>
                <button
                  className="battle-challenge-button"
                  onClick={() => void challengePlayer(player.id)}
                  disabled={pendingId === player.id}
                >
                  {pendingId === player.id ? 'Sending…' : 'Challenge'}
                </button>
              </div>
            ))}
          </div>
        )}
        {!searching && query.trim().length >= 2 && players.length === 0 && (
          <p className="battle-search-hint">No players found. Check the spelling and try again.</p>
        )}
      </section>

      {message && (
        <div className="battle-message" role="status">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} aria-label="Dismiss message"><X size={16} /></button>
        </div>
      )}

      {loading ? (
        <div className="battle-loading">Loading your arena…</div>
      ) : (
        <>
          {incomingBattles.length > 0 && (
            <section className="battle-list-section">
              <div className="battle-section-heading">
                <div><span className="battle-eyebrow">YOUR MOVE</span><h2>Challenges received</h2></div>
                <span className="battle-count">{incomingBattles.length}</span>
              </div>
              {incomingBattles.map((battle) => {
                const rival = battle.challenger;
                return (
                  <article className="battle-invite-card" key={battle.id}>
                    <PlayerAvatar player={rival} small />
                    <div className="battle-player-copy">
                      <strong>{rival?.name || rival?.username || 'A player'}</strong>
                      <span>challenged you to a 24-hour battle</span>
                    </div>
                    <button
                      className="battle-icon-action battle-accept"
                      onClick={() => void respond(battle, 'accept')}
                      disabled={pendingId === battle.id}
                      aria-label="Accept challenge"
                    ><Check size={18} /></button>
                    <button
                      className="battle-icon-action battle-decline"
                      onClick={() => void respond(battle, 'decline')}
                      disabled={pendingId === battle.id}
                      aria-label="Decline challenge"
                    ><X size={18} /></button>
                  </article>
                );
              })}
            </section>
          )}

          {activeBattles.length > 0 && (
            <section className="battle-list-section">
              <div className="battle-section-heading">
                <div><span className="battle-eyebrow">LIVE NOW</span><h2>Active battles</h2></div>
                <span className="battle-live-dot" />
              </div>
              {activeBattles.map((battle) => {
                const rival = otherPlayer(battle);
                const expiresAt = new Date(battle.expires_at || '').getTime();
                const expired = expiresAt <= now;
                return (
                  <article className="battle-card battle-card-live" key={battle.id}>
                    <div className="battle-card-topline">
                      <span className="battle-live-label"><i /> {expired ? 'SETTLING' : 'IN PLAY'}</span>
                      <span className="battle-countdown">
                        <Clock3 size={14} /> {formatCountdown(battle.expires_at, now)}
                      </span>
                    </div>
                    <div className="battle-scoreboard">
                      <div className="battle-score-player">
                        <PlayerAvatar player={user ? {
                          id: user.id,
                          name: [user.first_name, user.last_name].filter(Boolean).join(' '),
                          photo_url: user.photo_url,
                        } : null} />
                        <span className="battle-score-name">
                          {[user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'You'}
                        </span>
                        <strong>{battle.my_score.toLocaleString()}</strong>
                      </div>
                      <span className="battle-versus">VS</span>
                      <div className="battle-score-player">
                        <PlayerAvatar player={rival} />
                        <span className="battle-score-name">{rival?.name || 'Rival'}</span>
                        <strong>{battle.their_score.toLocaleString()}</strong>
                      </div>
                    </div>
                    <div className="battle-score-foot">
                      <span>Quiz points earned during the battle</span>
                      <span>24h clock</span>
                    </div>
                  </article>
                );
              })}
            </section>
          )}

          {outgoingBattles.length > 0 && (
            <section className="battle-list-section">
              <div className="battle-section-heading">
                <div><span className="battle-eyebrow">AWAITING ACCEPTANCE</span><h2>Challenges sent</h2></div>
              </div>
              {outgoingBattles.map((battle) => (
                <article className="battle-pending-card" key={battle.id}>
                  <PlayerAvatar player={battle.opponent} small />
                  <div className="battle-player-copy">
                    <strong>{battle.opponent?.name || battle.opponent?.username || 'Player'}</strong>
                    <span>24 hours begin once they accept</span>
                  </div>
                  <span className="battle-pending-tag">PENDING</span>
                </article>
              ))}
            </section>
          )}

          {completedBattles.length > 0 && (
            <section className="battle-list-section">
              <div className="battle-section-heading">
                <div><span className="battle-eyebrow">FINAL WHISTLE</span><h2>Recent results</h2></div>
                <Medal size={19} />
              </div>
              {completedBattles.slice(0, 12).map((battle) => {
                const won = battle.winner_id === user?.id;
                const drawn = !battle.winner_id;
                const rival = otherPlayer(battle);
                return (
                  <article className="battle-result-card" key={battle.id}>
                    <PlayerAvatar player={rival} small />
                    <div className="battle-player-copy">
                      <strong>{rival?.name || rival?.username || 'Player'}</strong>
                      <span>{battle.my_score} – {battle.their_score} points · {won ? 'Victory' : drawn ? 'Draw' : 'Defeat'}</span>
                    </div>
                    <span className={`battle-result-mark ${won ? 'is-win' : drawn ? 'is-draw' : 'is-loss'}`}>
                      {won ? <Trophy size={17} /> : drawn ? 'D' : 'L'}
                    </span>
                    {won || drawn ? (
                      <span className="battle-earned-coins">
                        <Coins size={13} /> {won ? 150 : 75}
                      </span>
                    ) : null}
                    <button
                      className="battle-rematch-button"
                      onClick={() => rival && void challengePlayer(rival.id)}
                      disabled={!rival || pendingId === rival?.id}
                      aria-label={`Challenge ${rival?.name || 'player'} again`}
                    >Rematch</button>
                  </article>
                );
              })}
            </section>
          )}

          {battles.length === 0 && (
            <div className="battle-empty-state">
              <span><Swords size={25} /></span>
              <h3>Your arena is quiet.</h3>
              <p>Search for a player above and send your first challenge.</p>
            </div>
          )}
        </>
      )}
    </main>
  );
};
