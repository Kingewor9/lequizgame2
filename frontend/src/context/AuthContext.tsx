import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, TelegramUser } from '../types';
import { apiService } from '../services/apiService';

interface AuthContextType {
  user: User | null;
  telegramUser: TelegramUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeTelegramAuth = async () => {
      try {
        const tg = (window as any).Telegram?.WebApp;

        if (!tg) {
          setError('Telegram Web App not available');
          setIsLoading(false);
          return;
        }

        tg.expand();

        const initData = tg.initData;
        if (!initData) {
          setError('No init data from Telegram');
          setIsLoading(false);
          return;
        }

        const params = new URLSearchParams(initData);
        const userData = params.get('user');

        if (!userData) {
          setError('No user data from Telegram');
          setIsLoading(false);
          return;
        }

        const parsedUser: TelegramUser = JSON.parse(userData);
        setTelegramUser(parsedUser);

        // Keep loading state true while retrying until successful
        const response = await apiService.post(
          '/auth/telegram-login',
          {
            telegram_id: parsedUser.id,
            first_name: parsedUser.first_name,
            last_name: parsedUser.last_name,
            username: parsedUser.username,
            photo_url: parsedUser.photo_url,
            init_data: initData,
          },
          (attempt, delay) => {
            console.log(`Retrying authentication (attempt ${attempt})... Waiting ${(delay / 1000).toFixed(1)}s`);
          }
        );

        if (response.success && response.data) {
          const data = response.data as any;

          // Save JWT token so apiService attaches it to all future requests
          if (data.access_token) {
            localStorage.setItem('access_token', data.access_token);
          }

          setUser(data as User);
          localStorage.setItem('telegram_id', parsedUser.id.toString());
          localStorage.setItem('user_data', JSON.stringify(data));
          setError(null);
        } else {
          setError(response.error || 'Authentication failed');
        }
      } catch (err) {
        console.error('Auth error:', err);
        setError(err instanceof Error ? err.message : 'Authentication error');
      } finally {
        setIsLoading(false);
      }
    };

    initializeTelegramAuth();
  }, []);

  const logout = () => {
    setUser(null);
    setTelegramUser(null);
    // Clear all stored auth data including JWT token
    localStorage.removeItem('access_token');
    localStorage.removeItem('telegram_id');
    localStorage.removeItem('user_data');
  };

  const refreshUser = async () => {
    try {
      if (!user) return;

      const response = await apiService.get(`/users/${user.id}`, (attempt, delay) => {
        console.log(`Retrying user refresh (attempt ${attempt})... Waiting ${(delay / 1000).toFixed(1)}s`);
      });
      if (response.success && response.data) {
        setUser(response.data as User);
        localStorage.setItem('user_data', JSON.stringify(response.data));
      }
    } catch (err) {
      console.error('Error refreshing user:', err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, telegramUser, isAuthenticated: !!user, isLoading, error, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};