'use client';

import { motion } from 'framer-motion';

export default function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.15 }}
          className="rounded-2xl h-32"
          style={{ background: 'var(--surface)' }}
        />
      ))}
    </div>
  );
}
