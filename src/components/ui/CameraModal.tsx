import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, RefreshCw, X, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';

export interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (files: File[]) => void;
  title?: string;
}

export function CameraModal({ isOpen, onClose, onCapture, title = 'Capture Photo' }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string>('');
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [capturedPreview, setCapturedPreview] = useState<string>('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(false);
  const fallbackInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera tracks cleanly
  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  }, [stream]);

  // Check available camera devices
  useEffect(() => {
    if (!isOpen) return;
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setHasMultipleCameras(videoInputs.length > 1);
      }).catch(() => {});
    }
  }, [isOpen]);

  // Start video stream when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      setCapturedBlob(null);
      setCapturedPreview('');
      setError('');
      return;
    }

    let isMounted = true;
    setError('');

    const startCamera = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera access is not supported by your browser.');
        }

        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        });

        if (!isMounted) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        if (!isMounted) return;
        const msg = err?.message || 'Unable to access camera';
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setError('Camera permission was denied. Please allow camera access in your browser settings or select an image file.');
        } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
          setError('No camera device detected on this system. You can choose a photo from your files.');
        } else {
          setError(`Camera error: ${msg}. You can choose an image file directly.`);
        }
      }
    };

    void startCamera();

    return () => {
      isMounted = false;
      stopStream();
    };
  }, [isOpen, facingMode]);

  // Ensure video element plays when stream is set
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedPreview(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.92
    );
  };

  const handleRetake = () => {
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedBlob(null);
    setCapturedPreview('');
  };

  const handleConfirm = () => {
    if (!capturedBlob) return;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const filename = `photo_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.jpg`;
    const file = new File([capturedBlob], filename, { type: 'image/jpeg' });

    stopStream();
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    onCapture([file]);
    onClose();
  };

  const handleFallbackChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.currentTarget.value = '';
    if (files.length) {
      stopStream();
      onCapture(files);
      onClose();
    }
  };

  const switchCamera = () => {
    stopStream();
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-slate-50">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <Camera className="h-4 w-4 text-brand-600" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              stopStream();
              onClose();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Viewfinder / Preview Body */}
        <div className="relative flex min-h-[300px] sm:min-h-[360px] items-center justify-center bg-black">
          {error ? (
            <div className="p-6 text-center text-white space-y-3">
              <AlertCircle className="mx-auto h-10 w-10 text-amber-400" />
              <p className="text-xs text-slate-200 max-w-xs mx-auto">{error}</p>
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-md hover:bg-brand-500"
              >
                <ImageIcon size={14} /> Choose Photo from Device
              </button>
            </div>
          ) : capturedPreview ? (
            <img
              src={capturedPreview}
              alt="Captured"
              className="max-h-[70vh] w-full object-contain"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className="max-h-[70vh] w-full object-cover"
              />
              {/* Target guidelines */}
              <div className="pointer-events-none absolute inset-6 border border-white/30 rounded-xl" />
            </>
          )}

          {/* Switch camera button (if live and multiple cameras exist) */}
          {!capturedPreview && !error && hasMultipleCameras && (
            <button
              type="button"
              onClick={switchCamera}
              className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-slate-900/60 text-white backdrop-blur-xs hover:bg-slate-900/90 shadow-md"
              title="Switch camera"
            >
              <RefreshCw size={15} />
            </button>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3">
          <input
            ref={fallbackInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFallbackChange}
          />

          <button
            type="button"
            onClick={() => fallbackInputRef.current?.click()}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-brand-600"
          >
            <ImageIcon size={14} />
            <span className="hidden sm:inline">Choose File</span>
          </button>

          <div className="flex items-center gap-2">
            {capturedPreview ? (
              <>
                <button
                  type="button"
                  onClick={handleRetake}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
                >
                  <Check size={14} /> Use Photo
                </button>
              </>
            ) : (
              !error && (
                <button
                  type="button"
                  onClick={handleCapture}
                  className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-2 text-xs font-bold text-white shadow-lg hover:bg-brand-500 hover:shadow-xl active:scale-95 transition-all"
                >
                  <Camera size={16} /> Snap Photo
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export interface CameraCaptureButtonProps {
  onCapture: (files: File[]) => void;
  title?: string;
  label?: string;
  className?: string;
  iconSize?: number;
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Universal Camera Capture Button:
 * - On mobile/touch devices: Directly launches the native camera intent via HTML5 capture="environment".
 * - On desktop/laptop: Opens a webcam capture modal with live video feed, switch camera, and snapshot.
 */
export function CameraCaptureButton({
  onCapture,
  title = 'Take photo with camera',
  label = 'Camera',
  className = '',
  iconSize = 13,
  size = 'sm',
}: CameraCaptureButtonProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);

  // Check if device is a mobile phone / tablet / Capacitor APK
  const isMobile = typeof navigator !== 'undefined' && (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 1024)
  );

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isMobile) {
      // Trigger native camera intent directly on mobile
      nativeInputRef.current?.click();
    } else {
      // On desktop, open webcam modal
      setModalOpen(true);
    }
  };

  const handleNativeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.currentTarget.value = '';
    if (files.length) {
      onCapture(files);
    }
  };

  const baseSizeClass =
    size === 'xs'
      ? 'h-6 px-1.5 text-[10px] gap-1'
      : size === 'md'
      ? 'h-9 px-3 text-xs gap-1.5'
      : 'h-7 px-2 text-[11px] gap-1';

  return (
    <>
      {/* Hidden native input with capture="environment" for immediate native camera on mobile */}
      <input
        ref={nativeInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleNativeChange}
      />

      <button
        type="button"
        onClick={handleClick}
        title={title}
        className={`inline-flex shrink-0 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-dashed border-slate-300 bg-white font-semibold text-slate-700 shadow-2xs hover:border-brand-500 hover:bg-brand-50 hover:text-brand-700 transition-colors ${baseSizeClass} ${className}`}
      >
        <Camera size={iconSize} className="text-slate-500" />
        {label ? <span>{label}</span> : null}
      </button>

      {modalOpen && (
        <CameraModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onCapture={onCapture}
          title={title}
        />
      )}
    </>
  );
}
