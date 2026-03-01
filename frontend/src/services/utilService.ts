// Utility functions for Footy IQ

export const triggerVibration = (duration: number = 100) => {
  if (navigator.vibrate) {
    navigator.vibrate(duration);
  } else if ((navigator as any).webkitVibrate) {
    (navigator as any).webkitVibrate(duration);
  }
};

export const triggerSuccessVibration = () => {
  if (navigator.vibrate) {
    navigator.vibrate([50, 30, 50]);
  }
};

export const triggerErrorVibration = () => {
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
};

export const formatTimeRemaining = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
};

export const formatQuizTimer = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const generateLeagueCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const calculateAccuracyRate = (correct: number, total: number): number => {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
};

export const isQuizExpired = (expiresAt: string): boolean => {
  return new Date(expiresAt) < new Date();
};

export const getTimeUntilExpiry = (expiresAt: string): number => {
  const now = new Date();
  const expiry = new Date(expiresAt);
  const diffMs = expiry.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / 1000));
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
};
