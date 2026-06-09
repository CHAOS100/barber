import React from 'react';
import { motion } from 'framer-motion';
import { Check, Clock } from 'lucide-react';

export default function ServiceSelector({ services, selectedService, onSelect }) {
  return (
    <div>
      {/* Section header */}
      <h3 className="text-base font-black mb-3 text-foreground">תורים</h3>

      {/* Service Cards */}
      <div className="space-y-2">
        {services.map((service, i) => {
          const isSelected = selectedService?.id === service.id;
          return (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onSelect(service)}
              className={`bg-card rounded-2xl p-4 cursor-pointer transition-all duration-200 flex items-center gap-3 border ${
                isSelected
                  ? 'border-primary gold-shadow'
                  : 'border-border hover:border-primary/40'
              }`}
            >
              {/* Selector circle */}
              <div className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
              }`}>
                {isSelected && <Check className="w-3.5 h-3.5 text-black" strokeWidth={3} />}
              </div>

              {/* Service info */}
              <div className="flex-1 text-right">
                <div className="font-bold text-foreground text-base">{service.name}</div>
                <div className="flex items-center gap-1.5 mt-1 justify-end">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="text-muted-foreground text-xs">{service.duration} דק׳</span>
                </div>
              </div>

              {/* Price */}
              <div className="text-primary font-black text-lg flex-shrink-0">
                ₪{service.price}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}