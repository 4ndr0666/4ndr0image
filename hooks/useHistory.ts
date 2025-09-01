/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useState, useCallback, useEffect, useRef } from 'react';
import { HistoryEntry } from '../types';

export const useHistory = (initialState: HistoryEntry[] = []) => {
  const [history, setHistory] = useState<HistoryEntry[]>(initialState);
  const [currentIndex, setCurrentIndex] = useState<number>(initialState.length - 1);
  const historyRef = useRef(history);
  historyRef.current = history;

  // Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      historyRef.current.forEach(entry => URL.revokeObjectURL(entry.thumbnailUrl));
    };
  }, []);

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const addToHistory = useCallback((newImageFile: File, replace = false) => {
    if (!(newImageFile instanceof File) || newImageFile.size === 0) {
      console.error("addToHistory was called with an invalid or empty File object:", newImageFile);
      // Prevent adding corrupted data to history, which would cause a crash.
      return;
    }

    const newEntry = {
      id: `${Date.now()}-${Math.random()}`,
      file: newImageFile,
      thumbnailUrl: URL.createObjectURL(newImageFile),
    };

    setHistory(prevHistory => {
      // Clean up the URL of the state being replaced
      if (replace && prevHistory.length > 0) {
          const stateToReplace = prevHistory[prevHistory.length - 1];
          URL.revokeObjectURL(stateToReplace.thumbnailUrl);
      }

      // When adding a new state after undoing, the "redo" stack is discarded.
      // We must clean up the URLs for these discarded states to prevent memory leaks.
      const discardedRedoEntries = prevHistory.slice(currentIndex + 1);
      discardedRedoEntries.forEach(entry => URL.revokeObjectURL(entry.thumbnailUrl));
        
      const newHistoryBase = prevHistory.slice(0, currentIndex + 1);

      const newHistory = replace 
        ? [...newHistoryBase.slice(0, -1), newEntry]
        : [...newHistoryBase, newEntry];
        
      return newHistory;
    });
    
    setCurrentIndex(prevIndex => replace ? prevIndex : prevIndex + 1);

  }, [currentIndex]);
  
  const setHistoryState = useCallback(({ history: newHistory, currentIndex: newIndex}: { history: HistoryEntry[], currentIndex: number }) => {
    setHistory(prev => {
        // clean up all old history before setting the new one
        prev.forEach(entry => URL.revokeObjectURL(entry.thumbnailUrl));
        return newHistory;
    });
    setCurrentIndex(newIndex);
  }, []);

  const undo = useCallback(() => {
    if (canUndo) {
      setCurrentIndex(prevIndex => prevIndex - 1);
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) {
      setCurrentIndex(prevIndex => prevIndex + 1);
    }
  }, [canRedo]);

  const goToHistory = useCallback((index: number) => {
    if (index >= 0 && index < history.length) {
      setCurrentIndex(index);
    }
  }, [history.length]);
  
  const resetHistory = useCallback(() => {
    setHistory(prev => {
        prev.forEach(entry => URL.revokeObjectURL(entry.thumbnailUrl));
        return [];
    });
    setCurrentIndex(-1);
  }, []);

  return { 
    history, 
    currentIndex, 
    canUndo, 
    canRedo, 
    addToHistory,
    setHistoryState,
    undo, 
    redo, 
    goToHistory, 
    resetHistory 
  };
};