import React, { useId } from 'react';
import { cn } from './cn';

export interface LogoProps {
  className?: string;
}

/**
 * The product mark, matching public/favicon.svg so the tab icon and the app
 * header are the same thing. It replaces the "ПА" initials placeholder that
 * shipped in the sidebar.
 *
 * Gradient ids are generated per instance — hardcoded ids collide when the mark
 * appears twice on a page (rail plus mobile drawer) and the second one renders
 * unfilled.
 */
export const Logo: React.FC<LogoProps> = ({ className }) => {
  const uid = useId();
  const bgId = `logo-bg-${uid}`;
  const playId = `logo-play-${uid}`;

  return (
    <svg viewBox="0 0 512 512" className={cn('h-9 w-9', className)} role="img" aria-label="ViralReel">
      <defs>
        <linearGradient id={bgId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E60FF" />
          <stop offset="100%" stopColor="#5D8DFF" />
        </linearGradient>
        <linearGradient id={playId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#EFF4FF" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="112" ry="112" fill={`url(#${bgId})`} />
      <circle cx="256" cy="256" r="155" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="24" />
      <polygon points="220,168 350,256 220,344" fill={`url(#${playId})`} opacity="0.95" />
      <circle cx="390" cy="130" r="18" fill="rgba(255,255,255,0.6)" />
      <circle cx="415" cy="105" r="10" fill="rgba(255,255,255,0.4)" />
      <circle cx="130" cy="390" r="14" fill="rgba(255,255,255,0.35)" />
    </svg>
  );
};

export default Logo;
