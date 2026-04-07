import { fetchApi } from '@/api/fetchApi'
import { RecordingApi } from './fetchRecording'

export const fetchRecordings = () => {
  return fetchApi<{ results: RecordingApi[] }>('/recordings/')
}
