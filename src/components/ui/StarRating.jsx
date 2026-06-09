import React from 'react';
import { Star } from 'lucide-react';

export default function StarRating({ rating, size = 'sm', interactive = false, onChange = undefined }) {
  const sizeClass = size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-5 h-5' : 'w-6 h-6';
  
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`${sizeClass} ${star <= rating ? 'fill-primary text-primary' : 'text-muted-foreground'} ${interactive ? 'cursor-pointer transition-transform hover:scale-110' : ''}`}
          onClick={interactive ? () => onChange?.(star) : undefined}
        />
      ))}
    </div>
  );
}
