import React from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '../../api/base44Client';
import { Check, User } from 'lucide-react';

const MOCK_BARBERS = [
  { id: 'any', name: 'ללא העדפה', photo_url: null, specialties: ['כל השירותים'] },
  { id: 'b1', name: 'OST', photo_url: 'https://media.base44.com/images/public/user_6a117f7117198ba9f6ef9d02/84e21045d_793158_69c0fc56e00f1.jpg', specialties: ['פייד', 'תספורת', 'זקן'] },
];

export default function BarberSelector({ selectedBarber, onSelect }) {
  const { data: barbers = MOCK_BARBERS } = useQuery({
    queryKey: ['barbers'],
    queryFn: async () => {
      try {
        const res = await base44.entities.Barber.filter({ is_active: true }, 'sort_order');
        return res.length > 0 ? [MOCK_BARBERS[0], ...res] : MOCK_BARBERS;
      } catch {
        return MOCK_BARBERS;
      }
    },
    placeholderData: MOCK_BARBERS,
  });

  return (
    <div>
      <h3 className="font-bold mb-3 text-sm text-muted-foreground">בחר ספר</h3>
      <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {barbers.map((barber) => {
          const isSelected = selectedBarber?.id === barber.id;
          return (
            <motion.button
              key={barber.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => onSelect(barber)}
              className={`flex-shrink-0 flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-all duration-200 min-w-[80px] ${
                isSelected ? 'glass-gold border border-primary' : 'glass'
              }`}
            >
              <div className="relative">
                {barber.photo_url ? (
                  <img src={barber.photo_url} alt={barber.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 glass rounded-full flex items-center justify-center">
                    <User className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                {isSelected && (
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 gold-gradient rounded-full flex items-center justify-center">
                    <Check className="w-2.5 h-2.5 text-black" />
                  </div>
                )}
              </div>
              <span className="text-xs font-bold text-center leading-tight">{barber.name}</span>
              {barber.specialties?.[0] && (
                <span className="text-xs text-muted-foreground text-center leading-tight">{barber.specialties[0]}</span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}