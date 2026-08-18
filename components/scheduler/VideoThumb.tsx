import React, { useRef, useState } from 'react';
import { ArrowPathIcon, PlayIcon } from '@heroicons/react/24/outline';
import type { ScheduledPost } from '../../types';

/*
  Hover preview for a queued post.

  This used to be declared inside InstagramScheduler's render body, which is a
  subtle and expensive mistake: a component defined during render is a new type
  on every render, so React unmounts the whole subtree and mounts a fresh one
  each time the parent's state changes. Every thumbnail lost its loaded video —
  and the parent re-renders on selection, on polling, on any keystroke in the
  scheduling form. Declared at module scope, the element and its loaded source
  survive.

  The signed URL arrives as a prop rather than through a closure, which is what
  makes moving it out possible at all.
*/

export interface VideoThumbProps {
  post: ScheduledPost;
  /** Short-lived signed URL, or undefined while it is still being issued. */
  url?: string;
  /** Draws the publishing spinner over the frame. */
  isActive: boolean;
}

const VideoThumb: React.FC<VideoThumbProps> = ({ post, url, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  // A clean variant keeps whatever aspect the source had; the rest are cropped
  // to a uniform tile so the queue reads as a grid.
  const preservesSourceAspect = post.font_settings?.variantKind === 'clean';

  /* The source is attached on first hover, not on mount: a queue of thirty
     posts would otherwise start thirty downloads nobody asked for. */
  const handleMouseEnter = () => {
    if (!post.video_path || !url) return;
    if (!loaded && videoRef.current) {
      videoRef.current.src = url;
      setLoaded(true);
    }
    videoRef.current?.play().catch(() => {});
  };

  const handleMouseLeave = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <div
      className={`w-full bg-gray-800 relative overflow-hidden ${preservesSourceAspect ? 'aspect-video' : 'h-36'}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          {post.video_path
            ? <PlayIcon className="w-8 h-8 text-white/30" />
            : <span className="text-xs text-white/40">Файл очищен</span>}
        </div>
      )}
      <video
        ref={videoRef}
        className={`w-full h-full ${preservesSourceAspect ? 'object-contain' : 'object-cover'}`}
        muted
        loop
        playsInline
        preload="none"
      />
      {isActive && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <ArrowPathIcon className="w-8 h-8 text-white animate-spin" />
        </div>
      )}
    </div>
  );
};

export default VideoThumb;
