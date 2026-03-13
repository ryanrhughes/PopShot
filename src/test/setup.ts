import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { chromeMock } from './chrome-mock'

// Make chrome available globally
vi.stubGlobal('chrome', chromeMock)
