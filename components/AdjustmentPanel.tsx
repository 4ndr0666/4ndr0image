/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import type { AdjustmentParams } from '../types';

interface AdjustmentPanelProps {
  onAdjust: (params: AdjustmentParams) => void;
  onCommit: () => void;
  onReset: () => void;
  isLoading: boolean;
  adjustmentParams: AdjustmentParams;
  setAdjustmentParams: React.Dispatch<React.SetStateAction<AdjustmentParams>>;
}

const Slider: React.FC<{
  label: string;
  value: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMouseUp: () => void;
  min?: number;
  max?: number;
  step?: number;
  disabled: boolean;
}> = ({ label, value, onChange, onMouseUp, min = -100, max = 100, step = 1, disabled }) => (
  <div className="flex flex-col gap-2 w-full">
    <div className="flex justify-between items-center">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      <span className="text-sm font-mono text-cyan-400 bg-gray-900/50 px-2 py-1 rounded-md">{value}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={onChange}
      onMouseUp={onMouseUp}
      disabled={disabled}
      className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed"
    />
  </div>
);


const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ 
  onAdjust, 
  onCommit, 
  onReset, 
  isLoading,
  adjustmentParams,
  setAdjustmentParams,
}) => {

  const handleParamChange = (param: keyof AdjustmentParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const newParams = { ...adjustmentParams, [param]: parseInt(e.target.value, 10) };
    setAdjustmentParams(newParams);
    // Debouncing is handled by App's useAutoSave, but for adjustments, we want real-time feedback
    onAdjust(newParams);
  };
  
  const handleCommit = () => {
    // This is called on mouse up, to potentially finalize an adjustment
    onCommit();
  };

  const handleReset = () => {
    setAdjustmentParams({ 
        brightness: 0, 
        contrast: 0, 
        saturation: 0,
        exposure: 0,
        highlights: 0,
        shadows: 0,
        vibrance: 0,
    });
    onReset();
  }
  
  const isPristine = Object.values(adjustmentParams).every(val => val === 0);

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col gap-6 animate-fade-in backdrop-blur-sm">
      <div className="text-center">
        <h3 className="text-xl font-semibold text-gray-200">Fine-Tune Adjustments</h3>
        <p className="text-sm text-gray-400 mt-1">Adjustments are applied locally for instant feedback.</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
        <Slider 
          label="Exposure"
          value={adjustmentParams.exposure}
          onChange={handleParamChange('exposure')}
          onMouseUp={handleCommit}
          disabled={isLoading}
        />
        <Slider 
          label="Brightness"
          value={adjustmentParams.brightness}
          onChange={handleParamChange('brightness')}
          onMouseUp={handleCommit}
          disabled={isLoading}
        />
        <Slider 
          label="Contrast"
          value={adjustmentParams.contrast}
          onChange={handleParamChange('contrast')}
          onMouseUp={handleCommit}
          disabled={isLoading}
        />
        <Slider 
          label="Highlights"
          value={adjustmentParams.highlights}
          onChange={handleParamChange('highlights')}
          onMouseUp={handleCommit}
          disabled={isLoading}
        />
        <Slider 
          label="Shadows"
          value={adjustmentParams.shadows}
          onChange={handleParamChange('shadows')}
          onMouseUp={handleCommit}
          disabled={isLoading}
        />
        <Slider 
          label="Vibrance"
          value={adjustmentParams.vibrance}
          onChange={handleParamChange('vibrance')}
          onMouseUp={handleCommit}
          disabled={isLoading}
        />
        <Slider 
          label="Saturation"
          value={adjustmentParams.saturation}
          onChange={handleParamChange('saturation')}
          onMouseUp={handleCommit}
          disabled={isLoading}
        />
      </div>
      
      <div className="mt-2">
        <button
            onClick={handleReset}
            className="w-full bg-white/10 border border-white/20 text-white font-bold py-3 px-6 rounded-lg transition-all duration-300 ease-in-out hover:bg-white/20 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isPristine}
        >
            Reset Adjustments
        </button>
      </div>
    </div>
  );
};

export default AdjustmentPanel;