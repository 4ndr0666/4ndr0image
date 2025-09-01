/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export interface HistoryEntry {
  id: string;
  file: File;
  thumbnailUrl: string;
}

export interface ZoomPanState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface AdjustmentParams {
  brightness: number;
  contrast: number;
  saturation: number;
  exposure: number;
  highlights: number;
  shadows: number;
  vibrance: number;
}

export interface SessionData {
  history: { id: string, file: File }[];
  currentIndex: number;
  zoomPanState: ZoomPanState;
}