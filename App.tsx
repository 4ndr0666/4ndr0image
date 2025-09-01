/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import { generateEditedImage, generateFilteredImage, generateAdjustedImage } from './services/geminiService';
import Header from './components/Header';
import Spinner from './components/Spinner';
import FilterPanel from './components/FilterPanel';
import AdjustmentPanel from './components/AdjustmentPanel';
import CropPanel from './components/CropPanel';
import HistoryPanel from './components/HistoryPanel';
import SessionRestoreModal from './components/SessionRestoreModal';
import { UndoIcon, RedoIcon, EyeIcon } from './components/icons';
import StartScreen from './components/StartScreen';
import { useHistory } from './hooks/useHistory';
import { useZoomPan } from './hooks/useZoomPan';
import { useAutoSave } from './hooks/useAutoSave';
import { AdjustmentParams, SessionData } from './types';
import * as db from './utils/db';

// Helper to convert a data URL string to a File object
const dataURLtoFile = (dataurl: string, filename: string): File => {
    const arr = dataurl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");

    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {type:mime});
}

type Tab = 'retouch' | 'fine-tune' | 'filters' | 'crop';

const App: React.FC = () => {
  const { history, currentIndex, canUndo, canRedo, addToHistory, undo, redo, goToHistory, resetHistory, setHistoryState } = useHistory();
  const [prompt, setPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [editHotspot, setEditHotspot] = useState<{ x: number, y: number } | null>(null);
  const [displayHotspot, setDisplayHotspot] = useState<{ x: number, y: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('retouch');
  
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>();
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  const isZoomPanEnabled = activeTab !== 'crop';
  const { zoomPanState, wrapperProps, viewProps } = useZoomPan(imgRef, isZoomPanEnabled);

  const [sessionToRestore, setSessionToRestore] = useState<SessionData | null>(null);
  const [hasCheckedSession, setHasCheckedSession] = useState(false);
  
  const currentHistoryEntry = history[currentIndex] ?? null;
  const originalHistoryEntry = history[0] ?? null;
  
  useAutoSave({ history, currentIndex, zoomPanState });
  
  // Adjustment worker state
  const workerRef = useRef<Worker | null>(null);
  const workerMessageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const adjustmentRequestIdRef = useRef(0);
  const [adjustmentParams, setAdjustmentParams] = useState<AdjustmentParams>({
    brightness: 0,
    contrast: 0,
    saturation: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
    vibrance: 0,
  });
  const [isPreviewingAdjustments, setIsPreviewingAdjustments] = useState(false);
  
  // Check for saved session on load
  useEffect(() => {
    const checkSession = async () => {
      try {
        const savedSession = await db.loadSession();
        if (savedSession) {
          // Basic validation to ensure session has the expected structure
          if (savedSession.history && Array.isArray(savedSession.history) && typeof savedSession.currentIndex === 'number') {
            setSessionToRestore(savedSession);
          } else {
            console.warn("Found invalid session data in IndexedDB. Clearing it.");
            await db.clearSession();
          }
        }
      } catch (err) {
        console.error("Error checking for saved session:", err);
        await db.clearSession(); // Clear potentially corrupted data
      } finally {
        setHasCheckedSession(true);
      }
    };
    checkSession();
  }, []);

  // Effect to keep worker message handler logic up-to-date
  useEffect(() => {
    type WorkerMessage = 
      | { resultImageData: ImageData; requestId: number; error?: never }
      | { error: string; requestId: number; resultImageData?: never };

    workerMessageHandlerRef.current = (event: MessageEvent<WorkerMessage>) => {
      try {
        if (event.data.requestId !== adjustmentRequestIdRef.current) {
          console.log("Ignoring stale worker response.");
          setIsLoading(false); // Still need to turn off loader for the stale request
          return;
        }

        if (event.data.error) {
          throw new Error(`Adjustment worker failed: ${event.data.error}`);
        }

        const { resultImageData } = event.data;
        if (!resultImageData) {
          throw new Error("Worker returned no image data and no error.");
        }

        const canvas = document.createElement('canvas');
        canvas.width = resultImageData.width;
        canvas.height = resultImageData.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(resultImageData, 0, 0);
          const file = dataURLtoFile(canvas.toDataURL(), `adjusted-${Date.now()}.png`);
          addToHistory(file, true); // Replace last history state for preview
        } else {
            throw new Error("Could not get canvas context for adjustment.");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to apply adjustment. ${errorMessage}`);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
  }, [addToHistory, setError]);

  // Initialize worker (runs only once on mount)
  useEffect(() => {
    let workerUrl: string | null = null;

    const initializeWorker = async () => {
        try {
            // Fetch the worker script content to avoid cross-origin issues
            const response = await fetch('/workers/adjustmentWorker.ts');
            if (!response.ok) {
                throw new Error(`Failed to fetch worker script with status: ${response.status}`);
            }
            const workerScript = await response.text();
            
            // Create a Blob from the script content
            const blob = new Blob([workerScript], { type: 'application/javascript' });
            
            // Create a URL for the Blob. This URL is from the same origin.
            workerUrl = URL.createObjectURL(blob);

            // Create the worker from the Blob URL
            const worker = new Worker(workerUrl, { type: 'module' });
            workerRef.current = worker;
            
            worker.onmessage = (event) => {
                if (workerMessageHandlerRef.current) {
                    workerMessageHandlerRef.current(event);
                }
            };

            worker.onerror = (err: ErrorEvent) => {
                console.error("Worker error event:", err);
                // err is an ErrorEvent. Its properties are message, filename, lineno, colno, error.
                // The 'error' property often holds the most useful stack trace.
                const details = err.message || (err.error ? err.error.stack || err.error.toString() : 'No details available.');
                setError(`An error occurred in the adjustment processor. Please try again. Details: ${details}`);
                setIsLoading(false);
            };

        } catch (err) {
            console.error("Failed to initialize adjustment worker:", err);
            const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
            setError(`A critical component (adjustment processor) failed to load. Please refresh the page. Details: ${errorMessage}`);
        }
    };

    initializeWorker();

    return () => {
        workerRef.current?.terminate();
        if (workerUrl) {
            URL.revokeObjectURL(workerUrl); // Clean up the Blob URL
        }
    };
  }, []); // Empty dependency array ensures this runs only once

  const handleRestoreSession = (session: SessionData) => {
    try {
      if (!session || !Array.isArray(session.history)) {
        throw new Error("Invalid session data structure.");
      }
      
      const validHistory = session.history
        .filter(item => item && item.file instanceof File && item.file.size > 0)
        .map(item => ({
            ...item,
            thumbnailUrl: URL.createObjectURL(item.file)
        }));

      if (validHistory.length !== session.history.length) {
          console.warn("Some history items were invalid and have been discarded during session restore.");
      }

      if (validHistory.length === 0) {
          throw new Error("No valid history items found in the session to restore.");
      }

      setHistoryState({
        history: validHistory,
        currentIndex: Math.min(session.currentIndex, validHistory.length - 1),
      });
      // TODO: Restore zoomPanState if session.zoomPanState exists
      setSessionToRestore(null);
    } catch(err) {
      console.error("Failed to restore session. Starting fresh.", err);
      setError("Your previous session data was corrupted and could not be restored. Starting a new session.");
      db.clearSession();
      setSessionToRestore(null);
    }
  };
  
  const handleDeclineRestore = () => {
    db.clearSession();
    setSessionToRestore(null);
  };
  
  const resetCommonState = useCallback(() => {
    setError(null);
    setPrompt('');
    setEditHotspot(null);
    setDisplayHotspot(null);
    setCrop(undefined);
    setCompletedCrop(undefined);
    setAdjustmentParams({
      brightness: 0,
      contrast: 0,
      saturation: 0,
      exposure: 0,
      highlights: 0,
      shadows: 0,
      vibrance: 0,
    });
  }, []);

  const handleImageUpload = useCallback((file: File) => {
    resetHistory();
    addToHistory(file);
    resetCommonState();
    setActiveTab('retouch');
  }, [addToHistory, resetHistory, resetCommonState]);

  const processNewImage = useCallback((newImageFile: File, operationName: string) => {
    setIsLoading(false);
    addToHistory(newImageFile);
    if (operationName === 'retouch') {
      setEditHotspot(null);
      setDisplayHotspot(null);
    }
  }, [addToHistory]);

  const handleGeminiRequest = useCallback(async (
    requestFn: () => Promise<string>,
    operationName: string
  ) => {
    if (!currentHistoryEntry) {
      setError(`No image loaded to perform operation: ${operationName}.`);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const imageUrl = await requestFn();
      const newImageFile = dataURLtoFile(imageUrl, `${operationName}-${Date.now()}.png`);
      processNewImage(newImageFile, operationName);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(`Failed to ${operationName} the image. ${errorMessage}`);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [currentHistoryEntry, processNewImage]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return setError('Please enter a description for your edit.');
    if (!editHotspot) return setError('Please click on the image to select an area to edit.');
    if (!currentHistoryEntry) return;

    handleGeminiRequest(() => 
        generateEditedImage(currentHistoryEntry.file, prompt, editHotspot),
      'retouch'
    );
  }, [currentHistoryEntry, prompt, editHotspot, handleGeminiRequest]);

  const handleApplyFilter = useCallback((filterPrompt: string) => {
    if (!currentHistoryEntry) return;
    handleGeminiRequest(() =>
        generateFilteredImage(currentHistoryEntry.file, filterPrompt),
      'filter'
    );
  }, [currentHistoryEntry, handleGeminiRequest]);

  // Handle local adjustments with worker
  const getBaseImageForAdjustment = async (): Promise<File> => {
     // If we are already previewing, the base image is the one *before* the current preview
    if (isPreviewingAdjustments && currentIndex > 0) {
      return history[currentIndex - 1].file;
    }
    return currentHistoryEntry!.file;
  };
  
  const sendToWorker = async (params: AdjustmentParams) => {
    const requestId = ++adjustmentRequestIdRef.current;
    const baseImageFile = await getBaseImageForAdjustment();
    const imageBitmap = await createImageBitmap(baseImageFile);
    const canvas = document.createElement('canvas');
    canvas.width = imageBitmap.width;
    canvas.height = imageBitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error("Could not create canvas context for image processing.");
    }
    ctx.drawImage(imageBitmap, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    if (!workerRef.current) {
        throw new Error("Adjustment worker is not available.");
    }
    workerRef.current.postMessage({ imageData, params, requestId });
    setIsLoading(true);
  };

  const handleAdjust = async (params: AdjustmentParams) => {
    if (!currentHistoryEntry) {
      setError("Cannot apply adjustments: no image is loaded.");
      return;
    }
    if (!isPreviewingAdjustments) {
        setIsPreviewingAdjustments(true);
    }
    try {
        await sendToWorker(params);
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Failed to process image for adjustment. ${errorMessage}`);
        console.error(err);
        setIsLoading(false);
    }
  };
  
  const handleCommitAdjustment = () => {
    setIsPreviewingAdjustments(false);
  };

  const handleResetAdjustment = () => {
    adjustmentRequestIdRef.current++; // Invalidate any in-flight requests
    if(isPreviewingAdjustments) {
        undo();
    }
    setIsPreviewingAdjustments(false);
  };

  const handleApplyCrop = useCallback(() => {
    if (!completedCrop || !imgRef.current) return setError('Please select an area to crop.');
    if (!currentHistoryEntry) return;

    // Capture dimensions immediately. Do not rely on the ref in the async callback,
    // as the underlying DOM element can be replaced during a re-render.
    const imageElement = imgRef.current;
    const displayWidth = imageElement.width;
    const displayHeight = imageElement.height;

    if (displayWidth === 0 || displayHeight === 0) {
        setError('Could not apply crop. The image dimensions are not available. Please try again.');
        console.error("Crop failed: imgRef.current had zero dimensions.");
        return;
    }

    const canvas = document.createElement('canvas');
    const sourceImage = new Image();
    let sourceUrl: string | null = null;

    try {
      sourceImage.onload = () => {
        try {
          const scaleX = sourceImage.naturalWidth / displayWidth;
          const scaleY = sourceImage.naturalHeight / displayHeight;
          
          canvas.width = completedCrop.width * scaleX;
          canvas.height = completedCrop.height * scaleY;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            throw new Error('Could not get canvas context for cropping.');
          }

          ctx.drawImage(
            sourceImage,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0, 0,
            canvas.width, canvas.height,
          );
          
          const croppedImageUrl = canvas.toDataURL('image/png');
          const newImageFile = dataURLtoFile(croppedImageUrl, `cropped-${Date.now()}.png`);
          addToHistory(newImageFile);
          setCrop(undefined);
          setCompletedCrop(undefined);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during crop processing.';
          setError(`Failed to apply crop. ${errorMessage}`);
          console.error(err);
        } finally {
          if (sourceUrl) URL.revokeObjectURL(sourceUrl);
        }
      };
      
      sourceImage.onerror = () => {
        setError('The image for cropping could not be loaded. It might be corrupted or an invalid format.');
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
      };

      sourceUrl = URL.createObjectURL(currentHistoryEntry.file);
      sourceImage.src = sourceUrl;
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred during crop setup.';
        setError(`Failed to initiate crop. ${errorMessage}`);
        console.error(err);
        if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    }

  }, [completedCrop, currentHistoryEntry, addToHistory, setError]);

  const handleReset = useCallback(() => {
    if (history.length > 0) {
      goToHistory(0);
      resetCommonState();
    }
  }, [history, goToHistory, resetCommonState]);

  const handleUploadNew = useCallback(() => {
      resetHistory();
      resetCommonState();
  }, [resetHistory, resetCommonState]);

  const handleDownload = useCallback(() => {
      if (currentHistoryEntry) {
          const link = document.createElement('a');
          link.href = currentHistoryEntry.thumbnailUrl;
          link.download = `edited-${currentHistoryEntry.file.name}`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
      }
  }, [currentHistoryEntry]);
  
  const handleFileSelect = (files: FileList | null) => {
    if (files && files[0]) handleImageUpload(files[0]);
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    try {
      if (activeTab !== 'retouch' || !imgRef.current) return;
      
      const img = imgRef.current;
      const rect = e.currentTarget.getBoundingClientRect();

      // Guard against unloaded image dimensions
      if (img.width === 0 || img.height === 0 || img.naturalWidth === 0 || img.naturalHeight === 0) {
          console.warn("Image dimensions are not yet available for hotspot calculation.");
          return;
      }

      const viewX = e.clientX - rect.left;
      const viewY = e.clientY - rect.top;
      
      // Correct calculation for scale() then translate()
      const imageX = (viewX - zoomPanState.offsetX) / zoomPanState.scale;
      const imageY = (viewY - zoomPanState.offsetY) / zoomPanState.scale;

      // Ensure the click is within the image bounds
      if (imageX < 0 || imageX > img.width || imageY < 0 || imageY > img.height) {
        return;
      }

      setDisplayHotspot({ x: imageX, y: imageY });
      
      const { naturalWidth, naturalHeight } = img;
      const originalX = Math.round(imageX * (naturalWidth / img.width));
      const originalY = Math.round(imageY * (naturalHeight / img.height));

      setEditHotspot({ x: originalX, y: originalY });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(`Could not select a point on the image. ${errorMessage}`);
        console.error(err);
    }
  };

  const renderContent = () => {
    if (!hasCheckedSession) {
      return <div className="flex justify-center items-center h-full"><Spinner /></div>;
    }

    if (sessionToRestore) {
      return <SessionRestoreModal onRestore={() => handleRestoreSession(sessionToRestore)} onDecline={handleDeclineRestore} />;
    }
    
    if (error) {
       return (
           <div className="text-center animate-fade-in bg-red-500/10 border border-red-500/20 p-8 rounded-lg max-w-2xl mx-auto flex flex-col items-center gap-4">
            <h2 className="text-2xl font-bold text-red-300">An Error Occurred</h2>
            <p className="text-md text-red-400">{error}</p>
            <button
                onClick={() => setError(null)}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg text-md transition-colors"
              >
                Try Again
            </button>
          </div>
        );
    }
    
    if (!currentHistoryEntry) {
      return <StartScreen onFileSelect={handleFileSelect} />;
    }

    const imageToDisplayUrl = isComparing ? originalHistoryEntry.thumbnailUrl : currentHistoryEntry.thumbnailUrl;

    const imageDisplay = (
        <img
            ref={imgRef}
            src={imageToDisplayUrl}
            alt={isComparing ? "Original" : "Current"}
            style={{
                // CSS transforms apply from left to right. Scale first, then translate.
                transform: `translate(${viewProps.offsetX}px, ${viewProps.offsetY}px) scale(${viewProps.scale})`,
                transition: 'opacity 0.2s ease-in-out',
            }}
            className="max-w-full max-h-full object-contain origin-top-left"
        />
    );

    return (
      <div className="w-full max-w-6xl mx-auto flex flex-col items-center gap-6 animate-fade-in">
        <div className="relative w-full h-[60vh] bg-black/20 rounded-xl overflow-hidden shadow-2xl flex items-center justify-center" {...wrapperProps} onClick={handleImageClick}>
            {isLoading && (
                <div className="absolute inset-0 bg-black/70 z-30 flex flex-col items-center justify-center gap-4 animate-fade-in">
                    <Spinner />
                    <p className="text-gray-300">AI is working its magic...</p>
                </div>
            )}
            
            {activeTab === 'crop' ? (
              <ReactCrop 
                crop={crop} 
                onChange={c => setCrop(c)} 
                onComplete={c => setCompletedCrop(c)}
                aspect={aspect}
                className="max-h-full max-w-full"
              >
                 <img src={currentHistoryEntry.thumbnailUrl} alt="Crop this image" className="max-h-[60vh] object-contain" ref={imgRef}/>
              </ReactCrop>
            ) : imageDisplay }

            {displayHotspot && !isLoading && activeTab === 'retouch' && (
              <div 
                  className="absolute pointer-events-none"
                  style={{ 
                      left: 0,
                      top: 0,
                      transform: `translate(${displayHotspot.x * zoomPanState.scale + zoomPanState.offsetX}px, ${displayHotspot.y * zoomPanState.scale + zoomPanState.offsetY}px)`,
                  }}
              >
                  <div className="relative w-6 h-6 -translate-x-1/2 -translate-y-1/2" style={{ transform: `scale(${1 / zoomPanState.scale})`}}>
                      <div className="absolute inset-0 rounded-full w-full h-full bg-blue-500/50 border-2 border-white"></div>
                      <div className="absolute inset-0 rounded-full w-full h-full animate-ping bg-blue-400"></div>
                  </div>
              </div>
            )}
        </div>
        
        <HistoryPanel history={history} currentIndex={currentIndex} onSelect={goToHistory} />

        <div className="w-full bg-gray-800/80 border border-gray-700/80 rounded-lg p-2 flex items-center justify-center gap-2 backdrop-blur-sm">
            {(['retouch', 'crop', 'fine-tune', 'filters'] as Tab[]).map(tab => (
                 <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`w-full capitalize font-semibold py-3 px-5 rounded-md transition-all duration-200 text-base ${
                        activeTab === tab 
                        ? 'bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/40' 
                        : 'text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    {tab === 'fine-tune' ? 'Fine-Tune' : tab}
                </button>
            ))}
        </div>
        
        <div className="w-full">
            {activeTab === 'retouch' && (
                <div className="flex flex-col items-center gap-4">
                    <p className="text-md text-gray-400">
                        {editHotspot ? 'Great! Now describe your localized edit below.' : 'Click an area on the image to make a precise edit.'}
                    </p>
                    <form onSubmit={(e) => { e.preventDefault(); handleGenerate(); }} className="w-full flex items-center gap-2">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={editHotspot ? "e.g., 'change my shirt color to blue'" : "First click a point on the image"}
                            className="flex-grow bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-5 text-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={isLoading || !editHotspot}
                        />
                        <button 
                            type="submit"
                            className="bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-5 px-8 text-lg rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                            disabled={isLoading || !prompt.trim() || !editHotspot}
                        >
                            Generate
                        </button>
                    </form>
                </div>
            )}
            {activeTab === 'crop' && <CropPanel onApplyCrop={handleApplyCrop} onSetAspect={setAspect} isLoading={isLoading} isCropping={!!completedCrop?.width && completedCrop.width > 0} />}
            {activeTab === 'fine-tune' && <AdjustmentPanel onAdjust={handleAdjust} onCommit={handleCommitAdjustment} onReset={handleResetAdjustment} isLoading={isLoading} adjustmentParams={adjustmentParams} setAdjustmentParams={setAdjustmentParams} />}
            {activeTab === 'filters' && <FilterPanel onApplyFilter={handleApplyFilter} isLoading={isLoading} />}
        </div>
        
        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
            <button 
                onClick={undo}
                disabled={!canUndo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Undo last action"
            >
                <UndoIcon className="w-5 h-5 mr-2" />
                Undo
            </button>
            <button 
                onClick={redo}
                disabled={!canRedo}
                className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-white/5"
                aria-label="Redo last action"
            >
                <RedoIcon className="w-5 h-5 mr-2" />
                Redo
            </button>
            
            <div className="h-6 w-px bg-gray-600 mx-1 hidden sm:block"></div>

            {canUndo && (
              <button 
                  onMouseDown={() => setIsComparing(true)}
                  onMouseUp={() => setIsComparing(false)}
                  onMouseLeave={() => setIsComparing(false)}
                  onTouchStart={() => setIsComparing(true)}
                  onTouchEnd={() => setIsComparing(false)}
                  className="flex items-center justify-center text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
                  aria-label="Press and hold to see original image"
              >
                  <EyeIcon className="w-5 h-5 mr-2" />
                  Compare
              </button>
            )}

            <button 
                onClick={handleReset}
                disabled={!canUndo}
                className="text-center bg-transparent border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/10 hover:border-white/30 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-transparent"
              >
                Reset
            </button>
            <button 
                onClick={handleUploadNew}
                className="text-center bg-white/10 border border-white/20 text-gray-200 font-semibold py-3 px-5 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/30 active:scale-95 text-base"
            >
                Upload New
            </button>

            <button 
                onClick={handleDownload}
                className="flex-grow sm:flex-grow-0 ml-auto bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-3 px-5 rounded-md transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base"
            >
                Download Image
            </button>
        </div>
      </div>
    );
  };
  
  return (
    <div className="min-h-screen text-gray-100 flex flex-col">
      <Header />
      <main className={`flex-grow w-full max-w-[1600px] mx-auto p-4 md:p-8 flex justify-center ${currentHistoryEntry ? 'items-start' : 'items-center'}`}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;