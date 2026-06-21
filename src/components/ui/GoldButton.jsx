import React from 'react';
import { motion } from 'framer-motion';

export default function GoldButton({ children, onClick, className = '', size = 'md', variant = 'solid', disabled = false, type = 'button', ...props }) {
  const sizeClasses = {
    sm: 'min-h-10 px-4 py-2 text-sm',
    md: 'min-h-12 px-6 py-3 text-base',
    lg: 'min-h-14 px-8 py-4 text-lg',
    xl: 'min-h-16 px-10 py-5 text-xl',
  };

  const variantClasses = {
    solid: 'gold-gradient text-black font-bold gold-glow',
    outline: 'border-2 border-primary text-primary bg-transparent hover:bg-primary/10',
    ghost: 'text-primary bg-transparent hover:bg-primary/10',
  };

  return (
    <motion.button
      type={/** @type {'button' | 'submit' | 'reset'} */ (type)}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      disabled={disabled}
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl text-center font-heebo leading-none select-none touch-manipulation border border-white/10 shadow-[0_14px_32px_rgba(0,0,0,0.22)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${sizeClasses[size]} ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : 'cursor-pointer'} ${className}`}
    >
      {children}
    </motion.button>
  );
}
