import { useState, useEffect } from 'react'
import { getAllBoards, type Account, type Board } from '@/lib/fizzy-api'
import { getApiKey, getLastUsedBoard, setLastUsedBoard, findDefaultBoardForUrl } from '@/lib/storage'

interface BoardSelectorProps {
  currentUrl?: string
  onSelect: (accountSlug: string, boardId: string, boardName: string) => void
  disabled?: boolean
}

interface BoardOption {
  account: Account
  board: Board
}

export function BoardSelector({ currentUrl, onSelect, disabled }: BoardSelectorProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [boards, setBoards] = useState<BoardOption[]>([])
  const [selectedValue, setSelectedValue] = useState<string>('')

  useEffect(() => {
    loadBoards()
  }, [currentUrl])

  const loadBoards = async () => {
    setLoading(true)
    setError(null)

    try {
      const apiKey = await getApiKey()
      if (!apiKey) {
        setError('No API key configured. Please set up your API key in Settings.')
        setLoading(false)
        return
      }

      const accountBoards = await getAllBoards(apiKey)
      
      // Flatten into board options
      const options: BoardOption[] = []
      for (const { account, boards: accountBoardList } of accountBoards) {
        for (const board of accountBoardList) {
          options.push({ account, board })
        }
      }
      
      setBoards(options)

      // Select default board
      if (options.length > 0) {
        let defaultBoardId: string | null = null

        // First, check URL-based defaults
        if (currentUrl) {
          defaultBoardId = await findDefaultBoardForUrl(currentUrl)
        }

        // Then, check last used board
        if (!defaultBoardId) {
          defaultBoardId = await getLastUsedBoard()
        }

        // Find the board in options
        let selectedOption = options.find(opt => opt.board.id === defaultBoardId)
        
        // If not found, use first board
        if (!selectedOption) {
          selectedOption = options[0]
        }

        const value = `${selectedOption.account.slug}|${selectedOption.board.id}`
        setSelectedValue(value)
        onSelect(selectedOption.account.slug, selectedOption.board.id, selectedOption.board.name)
      }
    } catch (err) {
      console.error('Failed to load boards:', err)
      setError('Failed to load boards. Please check your API key.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    setSelectedValue(value)

    const [accountSlug, boardId] = value.split('|')
    const option = boards.find(
      opt => opt.account.slug === accountSlug && opt.board.id === boardId
    )

    if (option) {
      await setLastUsedBoard(boardId)
      onSelect(accountSlug, boardId, option.board.name)
    }
  }

  if (loading) {
    return (
      <div className="board-selector loading">
        <div className="spinner-small" />
        <span>Loading boards...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="board-selector error">
        <span className="error-text">{error}</span>
        <button className="retry-btn" onClick={loadBoards}>
          Retry
        </button>
      </div>
    )
  }

  if (boards.length === 0) {
    return (
      <div className="board-selector empty">
        <span>No boards found. Create a board in Fizzy first.</span>
      </div>
    )
  }

  // Group boards by account
  const groupedBoards: Record<string, BoardOption[]> = {}
  for (const option of boards) {
    const key = option.account.name
    if (!groupedBoards[key]) {
      groupedBoards[key] = []
    }
    groupedBoards[key].push(option)
  }

  return (
    <div className="board-selector">
      <label htmlFor="board-select">Board:</label>
      <select
        id="board-select"
        value={selectedValue}
        onChange={handleChange}
        disabled={disabled}
      >
        {Object.entries(groupedBoards).map(([accountName, accountBoards]) => (
          <optgroup key={accountName} label={accountName}>
            {accountBoards.map((option) => (
              <option
                key={option.board.id}
                value={`${option.account.slug}|${option.board.id}`}
              >
                {option.board.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  )
}
