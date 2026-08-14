import React, { useEffect, useState } from 'react';
import { InstagramAccount } from '../types';

const sizes = {
  sm: 'w-8 h-8 rounded-lg text-xs',
  md: 'w-9 h-9 rounded-lg text-sm',
  lg: 'w-14 h-14 rounded-xl text-lg',
  xl: 'w-20 h-20 rounded-xl text-2xl',
};

interface AccountAvatarProps {
  account?: Pick<InstagramAccount, 'username' | 'profile_picture_url'> | null;
  size?: keyof typeof sizes;
  className?: string;
}

/**
 * Instagram serves profile pictures from a signed CDN URL that eventually
 * expires, so the image is always paired with an initial-letter fallback rather
 * than assumed to load. Verifying an account refreshes the stored URL.
 */
const AccountAvatar: React.FC<AccountAvatarProps> = ({ account, size = 'md', className = '' }) => {
  const [failed, setFailed] = useState(false);
  const url = account?.profile_picture_url || '';

  useEffect(() => { setFailed(false); }, [url]);

  const base = `${sizes[size]} flex-shrink-0 overflow-hidden ${className}`;

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={account?.username ? `@${account.username}` : ''}
        className={`${base} object-cover bg-gray-100`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`${base} bg-teal-600 text-white font-semibold flex items-center justify-center`}>
      {(account?.username?.charAt(0) || 'A').toUpperCase()}
    </div>
  );
};

export default AccountAvatar;
