/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useEffect, useRef } from 'react';
import { HistoryEntry, ZoomPanState } from '../types';
import { saveSession } from '../utils/db';

interface AutoSaveProps {
    history: HistoryEntry[];
    currentIndex: number;
    zoomPanState: ZoomPanState;
}

const DEBOUNCE_DELAY = 1000; // 1 second

export const useAutoSave = ({ history, currentIndex, zoomPanState }: AutoSaveProps) => {
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = window.setTimeout(() => {
        if (history.length > 0) {
            const sessionData = {
                history: history.map(({ id, file }) => ({ id, file })),
                currentIndex,
                zoomPanState,
            };
            saveSession(sessionData);
        } else {
            saveSession(null); // Clear session if history is empty
        }
    }, DEBOUNCE_DELAY);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [history, currentIndex, zoomPanState]);
};
