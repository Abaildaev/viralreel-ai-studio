import React, { useEffect, useRef, useState } from 'react';
import { InstagramAccount } from '../types';
import { refreshAccountAvatar } from '../services/instagramAccountService';

const sizes = {
  sm: 'w-8 h-8 rounded-lg text-xs',
  md: 'w-9 h-9 rounded-lg text-sm',
  lg: 'w-14 h-14 rounded-xl text-lg',
  xl: 'w-20 h-20 rounded-xl text-2xl',
};

interface AccountAvatarProps {
  account?: Pick<InstagramAccount, 'id' | 'username' | 'profile_picture_url'> | null;
  size?: keyof typeof sizes;
  className?: string;
}

/**
 * Instagram serves profile pictures from a signed CDN URL that eventually
 * expires, so the image is always paired with an initial-letter fallback rather
 * than assumed to load.
 *
 * A stale URL is repaired instead of merely absorbed: the first failure asks
 * Instagram for the current one and stores it, which is what makes the avatar
 * appear on a browser that has never cached it. Only a second failure — a
 * refreshed URL that is broken too, or an account whose token can no longer
 * read the profile — falls through to the letter.
 */
const AccountAvatar: React.FC<AccountAvatarProps> = ({ account, size = 'md', className = '' }) => {
  const stored = account?.profile_picture_url || '';
  const accountId = account?.id;

  const [src, setSrc] = useState(stored);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    setSrc(stored);
    setFailed(false);
  }, [stored]);

  // Assigned on the way in as well: StrictMode runs the cleanup once before
  // the real mount, and a ref left at false would swallow every refresh.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const handleError = async () => {
    if (!accountId) {
      setFailed(true);
      return;
    }

    const fresh = await refreshAccountAvatar(accountId);
    if (!mounted.current) return;

    // An unchanged URL is the same dead link, so retrying it would only loop.
    if (fresh && fresh !== src) setSrc(fresh);
    else setFailed(true);
  };

  const base = `${sizes[size]} flex-shrink-0 overflow-hidden ${className}`;

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={account?.username ? `@${account.username}` : ''}
        className={`${base} object-cover bg-gray-100`}
        onError={handleError}
      />
    );
  }

  return (
    <div className={`${base} bg-brand-600 text-white font-semibold flex items-center justify-center`}>
      {(account?.username?.charAt(0) || 'A').toUpperCase()}
    </div>
  );
};

export default AccountAvatar;
