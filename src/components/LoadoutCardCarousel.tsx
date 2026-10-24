import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import './loadout-cards.css';

export type LoadoutCardItem = {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  preview: React.ReactNode;
  disabled?: boolean;
  actionLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

export interface LoadoutCardCarouselProps {
  items: LoadoutCardItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  ar: boolean;
}

export const LoadoutCardCarousel: React.FC<LoadoutCardCarouselProps> = ({
  items,
  selectedId,
  onSelect,
  ar,
}) => {
  // Find initial index from selectedId
  const initialIndex = items.findIndex(item => item.id === selectedId);
  const [currentIndex, setCurrentIndex] = useState(initialIndex >= 0 ? initialIndex : 0);

  // Drag / swipe states
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(()=>{containerRef.current?.focus({preventScroll:true});},[]);

  // Clamp index when items array length changes without setState during render
  useEffect(() => {
    if (items.length === 0) {
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex(prev => Math.min(Math.max(0, prev), items.length - 1));
  }, [items.length]);

  const itemCount = items.length;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex < itemCount - 1;

  // Step functions: respect RTL semantics for browse directions
  const stepPrev = useCallback(() => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : prev));
  }, []);

  const stepNext = useCallback(() => {
    setCurrentIndex(prev => (prev < itemCount - 1 ? prev + 1 : prev));
  }, [itemCount]);

  // Physical keyboard navigation: left / right arrows
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (ar) {
          stepNext();
        } else {
          stepPrev();
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (ar) {
          stepPrev();
        } else {
          stepNext();
        }
      }
    },
    [ar, stepNext, stepPrev]
  );

  // Mouse / Touch drag handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag with primary pointer button
    if (e.button !== 0) return;
    if((e.target as HTMLElement).closest('button'))return;
    startXRef.current = e.clientX;
    setIsDragging(true);
    setDragOffset(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || startXRef.current === null) return;
    const diff = e.clientX - startXRef.current;
    // Dampen drag effect
    setDragOffset(diff * 0.7);
  };

  const handlePointerEnd = (e: React.PointerEvent) => {
    if (!isDragging || startXRef.current === null) return;
    const diff = e.clientX - startXRef.current;
    const threshold = 48; // minimum swipe threshold in pixels

    if (ar) {
      // In RTL, dragging right moves forward, dragging left moves backward
      if (diff > threshold && canGoNext) {
        stepNext();
      } else if (diff < -threshold && canGoPrev) {
        stepPrev();
      }
    } else {
      // In LTR, dragging left moves forward, dragging right moves backward
      if (diff < -threshold && canGoNext) {
        stepNext();
      } else if (diff > threshold && canGoPrev) {
        stepPrev();
      }
    }

    setIsDragging(false);
    setDragOffset(0);
    startXRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture was already released
    }
  };

  if (itemCount === 0) {
    return null;
  }

  const currentItem = items[currentIndex] || items[0];
  const isSelected = currentItem.id === selectedId;
  const isItemDisabled = Boolean(currentItem.disabled);

  // Neighboring cards for depth / ghost display
  const prevItem = currentIndex > 0 ? items[currentIndex - 1] : null;
  const nextItem = currentIndex < itemCount - 1 ? items[currentIndex + 1] : null;

  // Labels
  const activeLabel = ar ? 'مفعّل' : 'Active';
  const useLabel = ar ? 'استخدام' : 'Use';
  const unavailableLabel = ar ? 'غير متاح' : 'Unavailable';
  const prevAria = ar ? 'العنصر السابق' : 'Previous item';
  const nextAria = ar ? 'العنصر التالي' : 'Next item';

  const primaryButtonText = isSelected
    ? activeLabel
    : isItemDisabled
    ? (currentItem.actionLabel || unavailableLabel)
    : (currentItem.actionLabel || useLabel);

  // Calculate dynamic rotation based on drag offset
  const dragRotation = dragOffset * 0.05;

  return (
    <div
      className="loadout-carousel-container"
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label={ar ? 'مستعرض التجهيزات' : 'Loadout Carousel'}
      onKeyDown={handleKeyDown}
      ref={containerRef}
    >
      <div
        className="loadout-card-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={() => {setIsDragging(false);setDragOffset(0);startXRef.current=null;}}
        style={
          {
            '--drag-offset': `${dragOffset}px`,
            '--drag-rotation': `${dragRotation}deg`,
          } as React.CSSProperties
        }
      >
        {/* Ghost Card Behind (Previous item) */}
        {prevItem && (
          <div
            className="loadout-card card-ghost-prev"
            aria-hidden="true"
          >
            <div className="loadout-card-preview">{prevItem.preview}</div>
            <div className="loadout-card-info">
              <span className="loadout-card-title">{prevItem.title}</span>
            </div>
          </div>
        )}

        {/* Ghost Card Behind (Next item) */}
        {nextItem && (
          <div
            className="loadout-card card-ghost-next"
            aria-hidden="true"
          >
            <div className="loadout-card-preview">{nextItem.preview}</div>
            <div className="loadout-card-info">
              <span className="loadout-card-title">{nextItem.title}</span>
            </div>
          </div>
        )}

        {/* Main Active Card */}
        <div
          className={`loadout-card card-active ${isSelected ? 'is-selected' : ''}`}
          role="group"
          aria-roledescription="slide"
          aria-label={`${currentIndex + 1} of ${itemCount}: ${currentItem.title}`}
        >
          <div className="loadout-card-preview">{currentItem.preview}</div>

          <div className="loadout-card-info">
            <h3 className="loadout-card-title">{currentItem.title}</h3>
            {currentItem.subtitle && (
              <span className="loadout-card-subtitle">{currentItem.subtitle}</span>
            )}
            {currentItem.description && (
              <p className="loadout-card-description">{currentItem.description}</p>
            )}
          </div>

          <div className="loadout-card-actions">
            <div className="loadout-button-row">
              <button
                type="button"
                className={`loadout-primary-btn ${isSelected ? 'is-active-btn' : ''}`}
                disabled={isItemDisabled || isSelected}
                onClick={() => {
                  if (!isItemDisabled && !isSelected) {
                    onSelect(currentItem.id);
                  }
                }}
              >
                {isSelected && <Check size={14} />}
                <span>{primaryButtonText}</span>
              </button>

              {currentItem.secondaryLabel && currentItem.onSecondary && (
                <button
                  type="button"
                  className="loadout-secondary-btn"
                  onClick={currentItem.onSecondary}
                >
                  {currentItem.secondaryLabel}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Controls: Arrows and Counter */}
      <div className="loadout-carousel-controls">
        <button
          type="button"
          className="loadout-nav-arrow"
          aria-label={prevAria}
          disabled={!canGoPrev}
          onClick={stepPrev}
        >
          {ar ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}
        </button>

        <span className="loadout-carousel-counter" aria-live="polite">
          {currentIndex + 1} / {itemCount}
        </span>

        <button
          type="button"
          className="loadout-nav-arrow"
          aria-label={nextAria}
          disabled={!canGoNext}
          onClick={stepNext}
        >
          {ar ? <ChevronLeft size={17} /> : <ChevronRight size={17} />}
        </button>
      </div>
    </div>
  );
};
