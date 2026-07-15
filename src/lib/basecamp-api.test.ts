import { describe, it, expect, beforeEach } from 'vitest'
import { resetAllMocks, setMessageHandler } from '../test/chrome-mock'
import { getProjects, getTodoLists } from './basecamp-api'

describe('basecamp-api pagination', () => {
  beforeEach(() => {
    resetAllMocks()
  })

  const makeProject = (id: number) => ({
    id,
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    name: `Project ${id}`,
    description: '',
    purpose: 'topic',
    bookmark_url: '',
    url: `https://3.basecampapi.com/12345/projects/${id}.json`,
    app_url: `https://3.basecamp.com/12345/projects/${id}`,
    dock: [],
  })

  describe('getProjects', () => {
    it('follows rel="next" Link headers to fetch all pages', async () => {
      const page1 = Array.from({ length: 15 }, (_, i) => makeProject(i + 1))
      const page2 = Array.from({ length: 15 }, (_, i) => makeProject(i + 16))
      const page3 = [makeProject(31)]

      const requestedUrls: string[] = []
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        requestedUrls.push(msg.url)
        if (msg.url.includes('page=3')) {
          return { success: true, data: page3, headers: {} }
        }
        if (msg.url.includes('page=2')) {
          return {
            success: true,
            data: page2,
            headers: {
              link: '<https://3.basecampapi.com/12345/projects.json?page=3>; rel="next"',
            },
          }
        }
        return {
          success: true,
          data: page1,
          headers: {
            link: '<https://3.basecampapi.com/12345/projects.json?page=2>; rel="next"',
          },
        }
      })

      const result = await getProjects('token', 12345)

      expect(result).toHaveLength(31)
      expect(result[0].id).toBe(1)
      expect(result[30].id).toBe(31)
      expect(requestedUrls).toEqual([
        'https://3.basecampapi.com/12345/projects.json',
        'https://3.basecampapi.com/12345/projects.json?page=2',
        'https://3.basecampapi.com/12345/projects.json?page=3',
      ])
    })

    it('makes a single request when there is no Link header', async () => {
      const page1 = [makeProject(1), makeProject(2)]

      let requestCount = 0
      setMessageHandler(() => {
        requestCount++
        return { success: true, data: page1, headers: {} }
      })

      const result = await getProjects('token', 12345)

      expect(result).toHaveLength(2)
      expect(requestCount).toBe(1)
    })

    it('ignores Link headers without rel="next"', async () => {
      let requestCount = 0
      setMessageHandler(() => {
        requestCount++
        return {
          success: true,
          data: [makeProject(1)],
          headers: {
            link: '<https://3.basecampapi.com/12345/projects.json?page=1>; rel="prev"',
          },
        }
      })

      const result = await getProjects('token', 12345)

      expect(result).toHaveLength(1)
      expect(requestCount).toBe(1)
    })

    it('handles responses with no headers at all', async () => {
      setMessageHandler(() => ({ success: true, data: [makeProject(1)] }))

      const result = await getProjects('token', 12345)

      expect(result).toHaveLength(1)
    })
  })

  describe('getTodoLists', () => {
    const makeTodoList = (id: number) => ({
      id,
      status: 'active',
      title: `List ${id}`,
    })

    it('follows rel="next" Link headers to fetch all pages', async () => {
      setMessageHandler((message: unknown) => {
        const msg = message as { url: string }
        if (msg.url.includes('page=2')) {
          return { success: true, data: [makeTodoList(16)], headers: {} }
        }
        return {
          success: true,
          data: Array.from({ length: 15 }, (_, i) => makeTodoList(i + 1)),
          headers: {
            link: '<https://3.basecampapi.com/12345/buckets/1/todosets/2/todolists.json?page=2>; rel="next"',
          },
        }
      })

      const result = await getTodoLists(
        'token',
        'https://3.basecampapi.com/12345/buckets/1/todosets/2/todolists.json'
      )

      expect(result).toHaveLength(16)
    })
  })
})
