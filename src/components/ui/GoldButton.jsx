import React from 'react';
import { motion } from 'framer-motion';

export default function GoldButton({ children, onClick, className = '', size = 'md', variant = 'solid', disabled = false, type = 'button', ...props }) {
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-base',
    lg: 'px-8 py-4 text-lg',
    xl: 'px-10 py-5 text-xl',
  };

  const variantClasses = {
    solid: 'gold-gradient text-black font-bold gold-glow',
    outline: 'border-2 border-primary text-primary bg-transparent hover:bg-primary/10',
    ghost: 'text-primary bg-transparent hover:bg-primary/10',
  };

  return (
    <motion.button
      type={/** @type {'button' | 'submit' | 'reset'} */ (type)}
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      onClick={onClick}
      disabled={disabled}
      {...props}
      className={`rounded-2xl font-heebo transition-all duration-200 ${sizeClasses[size]} ${variantClasses[variant]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${className}`}
    >
      {children}
    </motion.button>
  );
}
