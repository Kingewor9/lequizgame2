import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type GameSound = 'click' | 'answerSelect' | 'correct' | 'incorrect' | 'points' | 'complete' | 'leagueWelcome';

interface GameSoundContextValue {
  isSoundEnabled: boolean;
  toggleSound: () => void;
  playSound: (sound: GameSound) => void;
}

const GameSoundContext = createContext<GameSoundContextValue | undefined>(undefined);
const SOUND_PREFERENCE_KEY = 'footy-iq-sound-enabled';

const getStoredSoundPreference = (): boolean => {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== 'false';
  } catch {
    return true;
  }
};

const soundNotes: Record<GameSound, Array<{ frequency: number; duration: number; wave?: OscillatorType }>> = {
  click: [{ frequency: 620, duration: 0.055 }],
  answerSelect: [{ frequency: 490, duration: 0.07 }],
  correct: [
    { frequency: 523.25, duration: 0.1 },
    { frequency: 659.25, duration: 0.1 },
    { frequency: 783.99, duration: 0.16 },
  ],
  incorrect: [
    { frequency: 246.94, duration: 0.11, wave: 'triangle' },
    { frequency: 196, duration: 0.15, wave: 'triangle' },
  ],
  points: [
    { frequency: 659.25, duration: 0.08 },
    { frequency: 880, duration: 0.15 },
  ],
  complete: [
    { frequency: 523.25, duration: 0.12 },
    { frequency: 659.25, duration: 0.12 },
    { frequency: 783.99, duration: 0.12 },
    { frequency: 1046.5, duration: 0.28 },
  ],
  leagueWelcome: [
    { frequency: 659.25, duration: 0.1 },
    { frequency: 783.99, duration: 0.1 },
    { frequency: 987.77, duration: 0.2 },
  ],
};

export const GameSoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSoundEnabled, setIsSoundEnabled] = useState(getStoredSoundPreference);
  const isSoundEnabledRef = useRef(isSoundEnabled);
  const audioContextRef = useRef<AudioContext | null>(null);

  const toggleSound = useCallback(() => {
    const nextEnabled = !isSoundEnabledRef.current;
    isSoundEnabledRef.current = nextEnabled;
    setIsSoundEnabled(nextEnabled);
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, String(nextEnabled));
    } catch (error) {
      console.warn('Could not save sound preference:', error);
    }
  }, []);

  const playSound = useCallback((sound: GameSound) => {
    if (!isSoundEnabledRef.current || typeof window === 'undefined') return;

    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;

    let context = audioContextRef.current;
    try {
      if (!context || context.state === 'closed') {
        context = new AudioContextConstructor();
        audioContextRef.current = context;
      }
      if (context.state === 'suspended') {
        void context.resume().catch((error: unknown) => {
          console.warn('Could not resume game audio:', error);
        });
      }
    } catch (error) {
      console.warn('Could not initialize game audio:', error);
      return;
    }

    const notes = soundNotes[sound];
    let offset = context.currentTime;
    const volume = sound === 'click' || sound === 'answerSelect' ? 0.035 : 0.055;

    notes.forEach(({ frequency, duration, wave = 'sine' }) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(frequency, offset);
      gain.gain.setValueAtTime(0.0001, offset);
      gain.gain.exponentialRampToValueAtTime(volume, offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, offset + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(offset);
      oscillator.stop(offset + duration + 0.015);
      offset += duration * 0.82;
    });
  }, []);

  const value = useMemo(
    () => ({ isSoundEnabled, toggleSound, playSound }),
    [isSoundEnabled, toggleSound, playSound],
  );

  return <GameSoundContext.Provider value={value}>{children}</GameSoundContext.Provider>;
};

export const useGameSound = (): GameSoundContextValue => {
  const context = useContext(GameSoundContext);
  if (!context) {
    throw new Error('useGameSound must be used within GameSoundProvider');
  }
  return context;
};
