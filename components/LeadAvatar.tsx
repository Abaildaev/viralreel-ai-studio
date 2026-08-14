import React from 'react';

interface LeadAvatarProps {
  username?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6 text-[10px]',
  md: 'w-7 h-7 text-[11px]',
  lg: 'w-9 h-9 text-xs',
  xl: 'w-12 h-12 text-sm',
};

export const LeadAvatar: React.FC<LeadAvatarProps> = ({
  username,
  size = 'md',
  className = '',
}) => {
  const cleanName = (username || 'user').replace(/^@/, '');
  const initials = cleanName.slice(0, 2).toUpperCase();

  return (
    <div
      className={`rounded-full flex-shrink-0 flex items-center justify-center font-medium bg-gray-100 text-gray-600 border border-gray-200/80 select-none ${sizeClasses[size]} ${className}`}
      title={`@${cleanName}`}
    >
      {initials}
    </div>
  );
};

export default LeadAvatar;
