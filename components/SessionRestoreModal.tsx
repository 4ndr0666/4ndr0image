/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';

interface SessionRestoreModalProps {
  onRestore: () => void;
  onDecline: () => void;
}

const SessionRestoreModal: React.FC<SessionRestoreModalProps> = ({ onRestore, onDecline }) => {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center animate-fade-in backdrop-blur-sm">
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl flex flex-col items-center text-center gap-4">
        <h2 className="text-2xl font-bold text-gray-100">Welcome Back!</h2>
        <p className="text-gray-400">
          We found a previous editing session. Would you like to restore it and continue where you left off?
        </p>
        <div className="flex items-center justify-center gap-4 mt-4 w-full">
          <button
            onClick={onDecline}
            className="w-full bg-white/10 hover:bg-white/20 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Start New
          </button>
          <button
            onClick={onRestore}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Restore Session
          </button>
        </div>
      </div>
    </div>
  );
};

export default SessionRestoreModal;
