'use client';

import React, { useState } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}

export function LoadingSpinner({ size = 'md', message }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      <div className={`${sizeClasses[size]} border-2 border-neutral-600 border-t-blue-500 rounded-full animate-spin`}></div>
      {message && <p className="text-sm text-neutral-400">{message}</p>}
    </div>
  );
}

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Button({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = 'primary',
  size = 'md',
  className = ''
}: ButtonProps) {
  const baseClasses = 'rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white focus:ring-blue-500',
    secondary: 'bg-neutral-600 hover:bg-neutral-500 text-white focus:ring-neutral-500',
    danger: 'bg-red-600 hover:bg-red-500 text-white focus:ring-red-500'
  };

  const sizeClasses = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
    >
      {loading ? (
        <div className="flex items-center space-x-2">
          <LoadingSpinner size="sm" />
          <span>Loading...</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
}

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  onClose?: () => void;
}

export function Alert({ type, title, message, onClose }: AlertProps) {
  const typeClasses = {
    success: 'bg-green-900/20 border-green-500 text-green-400',
    error: 'bg-red-900/20 border-red-500 text-red-400',
    warning: 'bg-yellow-900/20 border-yellow-500 text-yellow-400',
    info: 'bg-blue-900/20 border-blue-500 text-blue-400'
  };

  return (
    <div className={`border-l-4 p-4 rounded-r-lg ${typeClasses[type]}`}>
      <div className="flex items-start justify-between">
        <div>
          {title && <h4 className="font-medium mb-1">{title}</h4>}
          <p className="text-sm">{message}</p>}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-4 text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}