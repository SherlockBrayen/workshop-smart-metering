import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message: string =
      error.response?.data?.message ?? error.response?.data?.error ?? error.message ?? 'Terjadi kesalahan'
    return Promise.reject(new Error(message))
  }
)

export default apiClient
