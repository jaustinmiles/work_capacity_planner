/**
 * API Client for Task Planner Server
 *
 * Connects to the local server running on your Mac.
 * Update SERVER_URL to your Mac's local IP address.
 */

/* global fetch, RequestInit */

// TODO: Make this configurable via app settings
const SERVER_URL = 'http://192.168.1.100:3001'

interface ApiResponse<T> {
  data?: T
  error?: string
}

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = SERVER_URL) {
    this.baseUrl = baseUrl
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      })

      if (!response.ok) {
        const error = await response.text()
        return { error: error || `HTTP ${response.status}` }
      }

      const data = await response.json()
      return { data }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Network error',
      }
    }
  }

  // Health check
  async health(): Promise<ApiResponse<{ status: string; timestamp: string }>> {
    return this.request('/api/health')
  }

  // Sessions
  async getSessions(): Promise<ApiResponse<unknown[]>> {
    return this.request('/api/sessions')
  }

  // Tasks
  async getTasks(): Promise<ApiResponse<unknown[]>> {
    return this.request('/api/tasks')
  }

  async getTask(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/api/tasks/${id}`)
  }

  async createTask(task: unknown): Promise<ApiResponse<unknown>> {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(task),
    })
  }

  async updateTask(id: string, updates: unknown): Promise<ApiResponse<unknown>> {
    return this.request(`/api/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    })
  }

  async deleteTask(id: string): Promise<ApiResponse<void>> {
    return this.request(`/api/tasks/${id}`, {
      method: 'DELETE',
    })
  }

  // Work Sessions (time tracking)
  async startWorkSession(taskId: string): Promise<ApiResponse<unknown>> {
    return this.request('/api/work-sessions/start', {
      method: 'POST',
      body: JSON.stringify({ taskId }),
    })
  }

  async stopWorkSession(id: string): Promise<ApiResponse<unknown>> {
    return this.request(`/api/work-sessions/${id}/stop`, {
      method: 'PUT',
    })
  }
}

export const apiClient = new ApiClient()
export default apiClient
