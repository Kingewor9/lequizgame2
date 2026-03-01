import React, { useEffect, useState } from 'react';
import '../styles/components/Alert.css';

export type AlertType = 'success' | 'error' | 'warning' | 'info';

interface AlertProps {
  message: string;
  type: AlertType;
  duration?: number;
  onClose?: () => void;
}

export const Alert: React.FC<AlertProps> = ({ message, type, duration = 4000, onClose }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (duration === 0) return;

    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!isVisible) return null;

  return (
    <div className={`alert alert-${type}`} role="alert">
      <div className="alert-content">
        <span className="alert-icon">
          {type === 'success' && '✓'}
          {type === 'error' && '✕'}
          {type === 'warning' && '!'}
          {type === 'info' && 'ℹ'}
        </span>
        <span className="alert-message">{message}</span>
      </div>
      <button
        className="alert-close"
        onClick={() => {
          setIsVisible(false);
          onClose?.();
        }}
        aria-label="Close alert"
      >
        ✕
      </button>
    </div>
  );
};
