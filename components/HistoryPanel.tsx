/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useEffect } from 'react';
import type { HistoryEntry } from '../types';

interface HistoryPanelProps {
  history: HistoryEntry[];
  currentIndex: number;
  onSelect: (index: number) => void;
}

const HistoryPanel: React.FC<HistoryPanelProps> = ({ history, currentIndex, onSelect }) => {
  const activeItemRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [currentIndex]);
  
  if (history.length <= 1) {
    return null;
  }

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-2 animate-fade-in backdrop-blur-sm">
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {history.map((entry, index) => (
          <button
            key={entry.id}
            ref={index === currentIndex ? activeItemRef : null}
            onClick={() => onSelect(index)}
            className={`flex-shrink-0 w-24 h-24 rounded-md overflow-hidden transition-all duration-200 ease-in-out focus:outline-none ${
              index === currentIndex
                ? 'ring-4 ring-offset-2 ring-offset-gray-800 ring-blue-500 scale-105'
                : 'ring-2 ring-transparent hover:ring-blue-400 opacity-70 hover:opacity-100'
            }`}
            aria-label={`Go to history state ${index + 1}`}
          >
            <img
              src={entry.thumbnailUrl}
              alt={`History state ${index + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default HistoryPanel;
