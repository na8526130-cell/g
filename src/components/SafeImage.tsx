import React, { useState, useEffect } from 'react';
import { Music2 } from 'lucide-react';
import { getCachedBase64Image, toBase64Image } from '../utils/imageBase64';

interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  alt?: string;
  fallbackText?: string;
  useBase64?: boolean;
}

export const SafeImage: React.FC<SafeImageProps> = ({
  src,
  alt = '',
  className = '',
  fallbackText,
  useBase64 = true,
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(() => {
    if (!src) return undefined;
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;
    if (useBase64) return getCachedBase64Image(src);
    return src;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    if (!src || !useBase64) return false;
    if (src.startsWith('data:') || src.startsWith('blob:')) return false;
    return !getCachedBase64Image(src);
  });
  const [hasError, setHasError] = useState(false);
  const [triedFallback, setTriedFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHasError(false);
    setTriedFallback(false);

    if (!src) {
      setCurrentSrc(undefined);
      setIsLoading(false);
      return;
    }

    if (src.startsWith('data:') || src.startsWith('blob:')) {
      setCurrentSrc(src);
      setIsLoading(false);
      return;
    }

    if (!useBase64) {
      setCurrentSrc(src);
      setIsLoading(false);
      return;
    }

    const cached = getCachedBase64Image(src);
    if (cached) {
      setCurrentSrc(cached);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setCurrentSrc(undefined);

    toBase64Image(src).then((dataUrl) => {
      if (cancelled) return;
      if (dataUrl) {
        setCurrentSrc(dataUrl);
        setIsLoading(false);
      } else {
        // Fallback to direct source if proxy base64 conversion failed
        setTriedFallback(true);
        setCurrentSrc(src);
        setIsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src, useBase64]);

  const handleError = () => {
    if (src && !triedFallback) {
      setTriedFallback(true);
      setCurrentSrc(src.startsWith('http') ? `/api/proxy/image?url=${encodeURIComponent(src)}` : src);
    } else {
      setHasError(true);
    }
  };

  if (isLoading) {
    return (
      <div
        className={`bg-neutral-900/90 animate-pulse flex items-center justify-center overflow-hidden select-none ${className}`}
        aria-label={alt || fallbackText}
      >
        <Music2 className="w-1/3 h-1/3 opacity-20 text-neutral-500 shrink-0" />
      </div>
    );
  }

  if (!currentSrc || hasError) {
    return (
      <div
        className={`bg-neutral-900 border border-neutral-800 flex flex-col items-center justify-center text-neutral-600 overflow-hidden select-none ${className}`}
        title={alt || fallbackText}
      >
        <Music2 className="w-1/2 h-1/2 opacity-30 text-red-500/50 shrink-0" />
        {fallbackText && (
          <span className="text-[10px] mt-1 text-center font-medium text-neutral-400 line-clamp-1 px-1">
            {fallbackText}
          </span>
        )}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
      loading="lazy"
      {...props}
    />
  );
};
