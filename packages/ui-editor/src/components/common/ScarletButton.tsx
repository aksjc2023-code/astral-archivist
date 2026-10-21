import React from 'react';
import { IconChevronDown } from './ScarletIcons';

export type ScarletButtonVariant = 'primary' | 'secondary' | 'additional-v1' | 'additional-v2';

export interface ScarletButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ScarletButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  onDropdownClick?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
}

export const ScarletButton: React.FC<ScarletButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon,
  onDropdownClick,
  children,
  className = '',
  disabled,
  ...props
}) => {
  // Base Pill Styles
  const baseStyle: React.CSSProperties = {
    borderRadius: '9999px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontFamily: "'Lucida Grande', 'Verdana', sans-serif",
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.15s ease-in-out',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    outline: 'none',
  };

  const sizeStyles: Record<'sm' | 'md' | 'lg', React.CSSProperties> = {
    sm: { padding: '4px 14px', fontSize: '11px' },
    md: { padding: '7px 22px', fontSize: '13px' },
    lg: { padding: '9px 28px', fontSize: '14px' },
  };

  // Specific Variant Styling
  if (variant === 'primary') {
    return (
      <button
        style={{
          ...baseStyle,
          ...sizeStyles[size],
          backgroundColor: '#168BFF',
          color: '#FFFFFF',
          border: 'none',
          boxShadow: '0 2px 8px rgba(22, 139, 255, 0.25)',
        }}
        onMouseEnter={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = '#329AFF';
        }}
        onMouseLeave={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = '#168BFF';
        }}
        onMouseDown={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = '#0B6ED6';
        }}
        onMouseUp={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = '#329AFF';
        }}
        disabled={disabled}
        className={className}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  }

  if (variant === 'secondary') {
    return (
      <button
        style={{
          ...baseStyle,
          ...sizeStyles[size],
          backgroundColor: '#1E2229',
          color: '#A4B0BE',
          border: '1px solid #454D5B',
        }}
        onMouseEnter={e => {
          if (!disabled) {
            (e.currentTarget as HTMLElement).style.borderColor = '#A4B0BE';
            (e.currentTarget as HTMLElement).style.color = '#FFFFFF';
            (e.currentTarget as HTMLElement).style.backgroundColor = '#2A313D';
          }
        }}
        onMouseLeave={e => {
          if (!disabled) {
            (e.currentTarget as HTMLElement).style.borderColor = '#454D5B';
            (e.currentTarget as HTMLElement).style.color = '#A4B0BE';
            (e.currentTarget as HTMLElement).style.backgroundColor = '#1E2229';
          }
        }}
        disabled={disabled}
        className={className}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  }

  if (variant === 'additional-v1') {
    return (
      <button
        style={{
          ...baseStyle,
          ...sizeStyles[size],
          backgroundColor: 'transparent',
          color: '#FFFFFF',
          border: '1px solid #168BFF',
        }}
        onMouseEnter={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(22, 139, 255, 0.15)';
        }}
        onMouseLeave={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
        onMouseDown={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = '#168BFF';
        }}
        disabled={disabled}
        className={className}
        {...props}
      >
        {icon}
        {children}
      </button>
    );
  }

  // Variant: additional-v2 (Split Dropdown Pill)
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        borderRadius: '9999px',
        border: '1px solid #168BFF',
        backgroundColor: 'rgba(22, 139, 255, 0.08)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
      className={className}
    >
      <button
        style={{
          ...baseStyle,
          borderRadius: '0',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#FFFFFF',
          padding: size === 'sm' ? '4px 14px' : '7px 20px',
          fontSize: size === 'sm' ? '11px' : '13px',
        }}
        onMouseEnter={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(22, 139, 255, 0.2)';
        }}
        onMouseLeave={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
        disabled={disabled}
        {...props}
      >
        {icon}
        {children}
      </button>
      <div style={{ width: '1px', backgroundColor: 'rgba(22, 139, 255, 0.4)' }} />
      <button
        type="button"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 10px',
          border: 'none',
          backgroundColor: 'transparent',
          color: '#FFFFFF',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(22, 139, 255, 0.2)';
        }}
        onMouseLeave={e => {
          if (!disabled) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
        onClick={onDropdownClick}
        disabled={disabled}
        title="More Options"
      >
        <IconChevronDown size={14} color="#168BFF" />
      </button>
    </div>
  );
};
