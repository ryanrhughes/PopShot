import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { BasecampSessionExpired } from './BasecampSessionExpired'
import { resetAllMocks, setMessageHandler } from '../test/chrome-mock'

describe('BasecampSessionExpired', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  afterEach(() => {
    setMessageHandler(null)
  })

  describe('session_expired (invalid_grant) variant', () => {
    it('renders the session-expired copy and a working Reconnect button', async () => {
      setMessageHandler((message) => {
        const msg = message as { action: string }
        if (msg.action === 'basecampOAuthReconnect') {
          return { success: true, accountName: 'Acme' }
        }
        return { success: true }
      })

      const onReconnected = vi.fn()
      render(
        <BasecampSessionExpired kind="session_expired" onReconnected={onReconnected} />
      )

      // Copy matches the new canonical wording.
      expect(
        screen.getByText(/your basecamp session has expired/i)
      ).toBeInTheDocument()

      const reconnectBtn = screen.getByRole('button', { name: /reconnect/i })
      fireEvent.click(reconnectBtn)

      // During the reconnect the button shows the in-flight label and is disabled.
      await waitFor(() => {
        expect(onReconnected).toHaveBeenCalledTimes(1)
      })
    })

    it('disables the Reconnect button and shows "Reconnecting..." while the OAuth popup is open', async () => {
      // Handler that never resolves so we can observe the pending state.
      let resolveOAuth: ((v: unknown) => void) | null = null
      setMessageHandler(() => {
        return new Promise((resolve) => {
          resolveOAuth = resolve
        })
      })

      render(
        <BasecampSessionExpired kind="session_expired" onReconnected={vi.fn()} />
      )

      const reconnectBtn = screen.getByRole('button', { name: /reconnect/i })
      fireEvent.click(reconnectBtn)

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reconnecting/i })).toBeDisabled()
      })

      // Clean up the pending promise so React doesn't warn.
      await act(async () => {
        resolveOAuth?.({ success: true, accountName: 'Acme' })
      })
    })

    it('shows a retry affordance and error text when the OAuth flow fails', async () => {
      setMessageHandler(() => ({
        success: false,
        error: 'User cancelled the authorization',
      }))

      const onReconnected = vi.fn()
      render(
        <BasecampSessionExpired kind="session_expired" onReconnected={onReconnected} />
      )

      // Before any failure, Open Settings is hidden - the default state should
      // stay minimal and only expose the primary Reconnect action.
      expect(
        screen.queryByRole('button', { name: /settings/i })
      ).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /reconnect/i }))

      await waitFor(() => {
        expect(screen.getByText(/user cancelled/i)).toBeInTheDocument()
      })

      // Button is re-enabled so the user can retry.
      expect(screen.getByRole('button', { name: /reconnect/i })).not.toBeDisabled()
      expect(onReconnected).not.toHaveBeenCalled()

      // After a failure the Open Settings escape hatch appears so the user
      // isn't stuck retrying an OAuth popup they can't complete inline.
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
    })

    it('opens the options page when the Settings fallback is clicked after a reconnect failure', async () => {
      setMessageHandler(() => ({
        success: false,
        error: 'Basecamp is not configured',
      }))

      render(
        <BasecampSessionExpired kind="session_expired" onReconnected={vi.fn()} />
      )

      fireEvent.click(screen.getByRole('button', { name: /reconnect/i }))

      const settingsBtn = await screen.findByRole('button', { name: /settings/i })
      fireEvent.click(settingsBtn)

      expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1)
    })
  })

  describe('invalid_client variant', () => {
    it('renders the "reconfigure in Settings" copy instead of an inline Reconnect', () => {
      render(
        <BasecampSessionExpired kind="invalid_client" onReconnected={vi.fn()} />
      )

      expect(
        screen.getByText(/credentials need to be reconfigured/i)
      ).toBeInTheDocument()
      // Inline reconnect would loop forever for this error - steer the user to Settings.
      expect(screen.queryByRole('button', { name: /^reconnect$/i })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument()
    })
  })
})
