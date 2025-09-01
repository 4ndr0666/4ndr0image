/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { useState, useRef, useCallback, RefObject } from 'react';
import { ZoomPanState } from '../types';

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;

export const useZoomPan = (imgRef: RefObject<HTMLImageElement>, enabled: boolean) => {
  const [zoomPanState, setZoomPanState] = useState<ZoomPanState>({ scale: 1, offsetX: 0, offsetY: 0 });
  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const wrapperRef = useRef<HTMLDivElement>(null);

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!enabled) return;
    try {
      e.preventDefault();
      if (!wrapperRef.current) return;
      
      const rect = wrapperRef.current.getBoundingClientRect();
      const scroll = e.deltaY * -0.005;
      
      setZoomPanState(prev => {
        const { scale: oldScale, offsetX: oldOffsetX, offsetY: oldOffsetY } = prev;
        const newScale = clamp(oldScale + scroll, MIN_SCALE, MAX_SCALE);
        
        if (newScale === oldScale) return prev;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Correct formula for zooming towards a point, assuming CSS transform order is scale() then translate()
        const newOffsetX = mouseX - (mouseX - oldOffsetX) * (newScale / oldScale);
        const newOffsetY = mouseY - (mouseY - oldOffsetY) * (newScale / oldScale);

        return { scale: newScale, offsetX: newOffsetX, offsetY: newOffsetY };
      });
    } catch (err) {
      console.error("Error during zoom:", err);
    }
  }, [enabled]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;
    try {
      e.preventDefault();
      isPanningRef.current = true;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (wrapperRef.current) {
          wrapperRef.current.style.cursor = 'grabbing';
      }
    } catch (err) {
      console.error("Error on pan start:", err);
    }
  }, [enabled]);

  const onMouseUp = useCallback(() => {
    if (!enabled) return;
    try {
      isPanningRef.current = false;
      if (wrapperRef.current) {
          wrapperRef.current.style.cursor = 'grab';
      }
    } catch (err) {
      console.error("Error on pan end:", err);
    }
  }, [enabled]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!enabled || !isPanningRef.current) return;
    try {
      e.preventDefault();
      
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;

      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      
      setZoomPanState(prev => ({
          ...prev,
          offsetX: prev.offsetX + dx,
          offsetY: prev.offsetY + dy,
      }));
    } catch (err) {
      console.error("Error during pan move:", err);
    }
  }, [enabled]);
  
  const onMouseLeave = useCallback(() => {
    if (!enabled) return;
    try {
      if (isPanningRef.current) {
        isPanningRef.current = false;
        if (wrapperRef.current) {
          wrapperRef.current.style.cursor = 'grab';
        }
      }
    } catch (err) {
      console.error("Error on mouse leave:", err);
    }
  }, [enabled]);
  

  const wrapperProps = {
    ref: wrapperRef,
    onWheel,
    onMouseDown,
    onMouseUp,
    onMouseMove,
    onMouseLeave,
    style: { cursor: enabled ? 'grab' : 'auto', overflow: 'hidden' }
  };
  
  const viewProps = {
    scale: zoomPanState.scale,
    offsetX: zoomPanState.offsetX,
    offsetY: zoomPanState.offsetY,
  };

  return { zoomPanState, wrapperProps, viewProps };
};