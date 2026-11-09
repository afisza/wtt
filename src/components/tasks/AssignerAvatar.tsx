import { useState } from 'react';
import { assetUrl } from '@/lib/apiBase';
import { cn } from '@/lib/utils';

interface AssignerAvatarProps {
  name: string;
  avatar?: string;
  size?: number;
  className?: string;
}

/** Awatar osoby zlecającej z inicjałem jako fallback. */
export default function AssignerAvatar({
  name,
  avatar,
  size = 20,
  className,
}: AssignerAvatarProps) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.45)) };
  if (avatar && !failed) {
    return (
      <img
        src={assetUrl(avatar)}
        alt=""
        style={style}
        className={cn('shrink-0 rounded-full object-cover ring-1 ring-border', className)}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground ring-1 ring-border',
        className,
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
