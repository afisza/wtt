import React, { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { assetUrl } from '@/lib/apiBase'

interface AssignerPickerProps {
  selectedAssigners: string[]
  onChangeAssigners: (assigners: string[]) => void
  assigners: any[]
}

export default function AssignerPicker({ selectedAssigners, onChangeAssigners, assigners }: AssignerPickerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [failedAvatars, setFailedAvatars] = useState<Set<string>>(new Set())

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-assigner-dropdown]')) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const getFilteredAssigners = (query: string) => {
    if (!query || query.length < 2) return []
    const lowerQuery = query.toLowerCase()
    return assigners.filter(a => a.name.toLowerCase().includes(lowerQuery))
  }

  const getAssignerByName = (name: string) => assigners.find(a => a.name === name)

  const handleSelect = (name: string) => {
    if (!selectedAssigners.includes(name)) {
      onChangeAssigners([...selectedAssigners, name])
    }
    setShowDropdown(false)
    setSearchQuery('')
  }

  const handleRemove = (idx: number) => {
    onChangeAssigners(selectedAssigners.filter((_, i) => i !== idx))
  }

  const filtered = getFilteredAssigners(searchQuery)

  return (
    <div className="relative" data-assigner-dropdown>
      {selectedAssigners.length > 0 && (
        <div className="w-full px-1.5 py-1 border border-[var(--app-accent)] rounded-[3px] text-[13px] bg-[var(--app-card-alt)] text-[var(--app-text)] flex flex-wrap gap-1 mb-1 min-h-[32px]">
          {selectedAssigners.map((name, idx) => {
            const assigner = getAssignerByName(name)
            return (
              <div
                key={idx}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-[var(--app-card)] rounded-full text-[11px]"
              >
                {assigner?.avatar && !failedAvatars.has(assigner.avatar) ? (
                  <img
                    src={assetUrl(assigner.avatar)}
                    alt={name}
                    className="w-4 h-4 rounded-full object-cover"
                    onError={() => {
                      if (assigner?.avatar) {
                        setFailedAvatars(prev => new Set(prev).add(assigner.avatar))
                      }
                    }}
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-[var(--app-accent)] text-[var(--app-accent-foreground)] flex items-center justify-center text-[9px] font-semibold">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <span>{name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemove(idx)
                  }}
                  className="p-0 bg-transparent border-none cursor-pointer flex items-center text-[var(--app-text-muted)] ml-0.5 hover:text-red-500"
                  title="Usuń"
                >
                  <X size={12} color="currentColor" />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => {
          const query = e.target.value
          setSearchQuery(query)
          setShowDropdown(query.length >= 2)
        }}
        placeholder="Wpisz minimum 2 litery aby dodać osobę..."
        onClick={(e) => {
          e.stopPropagation()
          if (searchQuery.length >= 2) setShowDropdown(true)
        }}
        className="w-full px-2.5 py-1.5 border border-[var(--app-accent)] rounded-[3px] text-[13px] bg-[var(--app-card-alt)] text-[var(--app-text)] outline-none"
        autoFocus
      />
      {showDropdown && searchQuery.length >= 2 && (
        <div className="absolute top-full left-0 right-0 bg-[var(--app-card-alt)] border border-[var(--app-border)] rounded-[3px] mt-1 max-h-[200px] overflow-y-auto z-[1000] shadow-[0_4px_6px_rgba(0,0,0,0.3)]">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[var(--app-text-muted)] text-xs">
              Brak wyników
            </div>
          ) : (
            filtered
              .filter(assigner => !selectedAssigners.includes(assigner.name))
              .map((assigner) => (
                <div
                  key={assigner.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelect(assigner.name)
                  }}
                  className="px-3 py-2 cursor-pointer flex items-center gap-2 border-b border-[var(--app-border)] hover:bg-[var(--app-card)]"
                >
                  {assigner.avatar && !failedAvatars.has(assigner.avatar) ? (
                    <img
                      src={assetUrl(assigner.avatar)}
                      alt={assigner.name}
                      className="w-6 h-6 rounded-full object-cover"
                      onError={() => {
                        if (assigner.avatar) {
                          setFailedAvatars(prev => new Set(prev).add(assigner.avatar))
                        }
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[var(--app-accent)] flex items-center justify-center text-[11px] font-semibold text-[var(--app-accent-foreground)]">
                      {assigner.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-[13px] text-[var(--app-text)]">{assigner.name}</span>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  )
}
