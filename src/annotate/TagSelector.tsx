import { useState, useEffect, useRef } from 'react'
import { getTags, type Tag } from '@/lib/fizzy-api'
import { getApiKey } from '@/lib/storage'

interface TagSelectorProps {
  accountSlug: string | null
  selectedTagIds: string[]
  onTagsChange: (tagIds: string[]) => void
  disabled?: boolean
}

export function TagSelector({ accountSlug, selectedTagIds, onTagsChange, disabled }: TagSelectorProps) {
  const [loading, setLoading] = useState(false)
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (accountSlug) {
      loadTags()
    } else {
      setTags([])
    }
  }, [accountSlug])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const loadTags = async () => {
    if (!accountSlug) return

    setLoading(true)
    setError(null)

    try {
      const apiKey = await getApiKey()
      if (!apiKey) {
        setError('No API key')
        setLoading(false)
        return
      }

      const fetchedTags = await getTags(apiKey, accountSlug)
      setTags(fetchedTags)
    } catch (err) {
      console.error('Failed to load tags:', err)
      setError('Failed to load tags')
    } finally {
      setLoading(false)
    }
  }

  const toggleTag = (tagId: string) => {
    if (disabled) return
    
    if (selectedTagIds.includes(tagId)) {
      onTagsChange(selectedTagIds.filter(id => id !== tagId))
    } else {
      onTagsChange([...selectedTagIds, tagId])
    }
  }

  const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id))

  if (loading) {
    return (
      <div className="tag-selector loading">
        <div className="spinner-small" />
        <span>Loading tags...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="tag-selector error">
        <span className="error-text">{error}</span>
      </div>
    )
  }

  if (!accountSlug) {
    return (
      <div className="tag-selector empty">
        <span>Select a board first</span>
      </div>
    )
  }

  if (tags.length === 0) {
    return (
      <div className="tag-selector empty">
        <span>No tags available</span>
      </div>
    )
  }

  return (
    <div className="tag-selector" ref={containerRef}>
      <div 
        className={`tag-selector-input ${isOpen ? 'open' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        {selectedTags.length > 0 ? (
          <div className="selected-tags">
            {selectedTags.map(tag => (
              <span 
                key={tag.id} 
                className="tag-chip"
                style={{ backgroundColor: tag.color || '#4f46e5' }}
              >
                {tag.title}
                <button 
                  className="tag-remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleTag(tag.id)
                  }}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="placeholder">Click to select tags...</span>
        )}
        <span className="dropdown-arrow">{isOpen ? '\u25B2' : '\u25BC'}</span>
      </div>

      {isOpen && (
        <div className="tag-dropdown">
          {tags.map(tag => (
            <label 
              key={tag.id} 
              className={`tag-option ${selectedTagIds.includes(tag.id) ? 'selected' : ''}`}
            >
              <input
                type="checkbox"
                checked={selectedTagIds.includes(tag.id)}
                onChange={() => toggleTag(tag.id)}
                disabled={disabled}
              />
              <span className="tag-name">{tag.title}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
