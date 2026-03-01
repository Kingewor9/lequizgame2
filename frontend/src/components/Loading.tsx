import React from 'react';
import '../styles/components/Loading.css';

interface LoadingProps {
  message?: string;
  fullScreen?: boolean;
}

export const Loading: React.FC<LoadingProps> = ({ message = 'Loading...', fullScreen = false }) => {
  return (
    <div className={`loading-container ${fullScreen ? 'fullscreen' : ''}`}>
      <div className="spinner"></div>
      <p className="loading-message">{message}</p>
    </div>
  );
};
