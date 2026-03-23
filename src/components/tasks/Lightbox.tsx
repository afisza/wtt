import React, { useEffect } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { attachmentSrc } from './types'

interface LightboxProps {
  lightbox: { urls: string[]; index: number } | null
  setLightbox: React.Dispatch<React.SetStateAction<{ urls: string[]; index: number } | null>>
}

export default function Lightbox({ lightbox, setLightbox }: LightboxProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [setLightbox])

  useEffect(() => {
    if (!lightbox) return
    const handleArrow = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setLightbox(prev => prev ? { ...prev, index: Math.max(0, prev.index - 1) } : null)
      } else if (e.key === 'ArrowRight') {
        setLightbox(prev => prev ? { ...prev, index: Math.min(prev.urls.length - 1, prev.index + 1) } : null)
      }
    }
    document.addEventListener('keydown', handleArrow)
    return () => document.removeEventListener('keydown', handleArrow)
  }, [lightbox, setLightbox])

  if (!lightbox) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Podgląd załącznika"
      onClick={() => setLightbox(null)}
      className="fixed inset-0 bg-black/85 z-[9999] flex items-center justify-center p-5"
    >
      <button
        type="button"
        onClick={() => setLightbox(null)}
        aria-label="Zamknij podgląd"
        className="absolute top-3 right-3 bg-[var(--app-card)] border border-[var(--app-border)] rounded-md p-2 min-h-[44px] min-w-[44px] cursor-pointer text-[var(--app-text)] text-sm flex items-center justify-center"
      >
        Zamknij
      </button>
      {lightbox.urls.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setLightbox(prev => prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : null)
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-[var(--app-card)] border border-[var(--app-border)] rounded-md p-2 min-h-[44px] min-w-[44px] cursor-pointer text-[var(--app-text)] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Poprzedni załącznik"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setLightbox(prev => prev && prev.index < prev.urls.length - 1 ? { ...prev, index: prev.index + 1 } : null)
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-[var(--app-card)] border border-[var(--app-border)] rounded-md p-2 min-h-[44px] min-w-[44px] cursor-pointer text-[var(--app-text)] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Następny załącznik"
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}
      <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh] overflow-auto flex items-center justify-center">
        {(() => {
          const url = lightbox.urls[lightbox.index]
          if (!url) return null
          const isImg = /\.(jpe?g|png|gif|webp)$/i.test(url) || url.includes('/task-attachments/')
          return isImg ? (
            <img src={attachmentSrc(url)} alt="" className="max-w-full max-h-[85vh] object-contain" />
          ) : (
            <a href={attachmentSrc(url)} target="_blank" rel="noopener noreferrer" className="text-[var(--app-accent)] text-base">
              Otwórz / Pobierz plik
            </a>
          )
        })()}
      </div>
      {lightbox.urls.length > 1 && (
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[var(--app-text-muted)] text-xs">
          {lightbox.index + 1} / {lightbox.urls.length}
        </span>
      )}
    </div>
  )
}
