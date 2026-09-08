'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, Download, LoaderCircle, Send, X } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/atoms/Dialog/Dialog';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { useWorldPhotoPost } from '@/hooks/useWorldPhotoPost/useWorldPhotoPost';
import styles from './World.module.css';

interface WorldCameraProps {
  disabled: boolean;
  onCapture: () => Promise<Blob | null>;
  onOpenChange: (open: boolean) => void;
  onReturnFocus: () => void;
}

export function WorldCamera({ disabled, onCapture, onOpenChange, onReturnFocus }: WorldCameraProps) {
  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const { openComposer, composer, isComposerOpen, isAuthenticated, network, error, clearError } = useWorldPhotoPost();

  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!photo) return;
    return () => URL.revokeObjectURL(photo.url);
  }, [photo]);
  useEffect(() => {
    onOpenChange(capturing || photo !== null || isComposerOpen);
  }, [capturing, photo, isComposerOpen, onOpenChange]);

  async function takePhoto() {
    if (disabled || inFlight.current || photo || isComposerOpen) return;
    const current = generation.current;
    inFlight.current = true;
    setCapturing(true);
    setCaptureError(null);
    clearError();
    try {
      const blob = await onCapture();
      if (current !== generation.current) return;
      if (!blob || blob.type !== 'image/png' || blob.size === 0 || blob.size > IMAGE_MAX_RAW_SIZE) {
        setCaptureError('The camera missed that moment. Try taking your photo again.');
        return;
      }
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch {
      if (current === generation.current)
        setCaptureError('The camera missed that moment. Try taking your photo again.');
    } finally {
      inFlight.current = false;
      if (current === generation.current) setCapturing(false);
    }
  }

  function discard() {
    generation.current += 1;
    setPhoto(null);
    clearError();
  }

  return (
    <>
      <Button
        overrideDefaults
        aria-label="Take a photo"
        title="Take a photo of the world"
        disabled={disabled || capturing || photo !== null || isComposerOpen}
        onClick={() => void takePhoto()}
      >
        {capturing ? <LoaderCircle size={18} className={styles.spin} /> : <Camera size={18} />}
      </Button>
      {captureError && (
        <div className={styles.captureNotice} role="alert">
          {captureError}
        </div>
      )}
      <Dialog
        open={photo !== null}
        onOpenChange={(open) => {
          if (!open) discard();
        }}
      >
        <DialogContent
          overrideDefaults
          showCloseButton={false}
          className={`${styles.dialog} ${styles.photoDialog}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!isComposerOpen) onReturnFocus();
          }}
        >
          <DialogClose asChild>
            <Button overrideDefaults className={styles.closeButton} aria-label="Close photo and return to world">
              <X size={20} />
            </Button>
          </DialogClose>
          <div className={styles.dialogEyebrow}>
            <Camera size={14} /> A POSTCARD FROM PUBKY WORLD
          </div>
          <DialogTitle className={styles.dialogTitle}>Wish you were here.</DialogTitle>
          <DialogDescription className={styles.dialogDescription}>
            A little world, a moment worth keeping. Your photo leaves the menus behind.
          </DialogDescription>
          {photo && (
            <>
              {/* This short-lived local blob is already encoded, so it needs no image optimization. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.photoPreview} src={photo.url} alt="Your photo from Pubky World" />
              <p className={styles.photoDestination}>
                {network === 'production'
                  ? 'Posts go to Pubky production. Add a caption and review your photo before publishing.'
                  : 'Posting needs the full Pubky app with a configured network. You can download your photo here.'}
              </p>
              {!isAuthenticated && network !== 'unavailable' && (
                <p className={styles.photoDestination}>
                  Download before signing in; photos are only kept while this world stays open.
                </p>
              )}
              {error && (
                <p className={styles.photoError} role="status">
                  {error}
                </p>
              )}
              <div className={styles.photoActions}>
                <a className={styles.secondaryButton} href={photo.url} download="pubky-world.png">
                  <Download size={17} /> Download photo
                </a>
                <Button
                  overrideDefaults
                  className={styles.primaryButton}
                  disabled={network === 'unavailable'}
                  onClick={() => {
                    if (openComposer(photo.blob)) setPhoto(null);
                  }}
                >
                  {isAuthenticated || network === 'unavailable' ? 'Post to Pubky' : 'Sign in to post'}{' '}
                  <Send size={17} />
                </Button>
              </div>
              <DialogClose asChild>
                <Button overrideDefaults className={styles.reframeButton}>
                  Back to framing
                </Button>
              </DialogClose>
            </>
          )}
        </DialogContent>
      </Dialog>
      {composer}
    </>
  );
}
