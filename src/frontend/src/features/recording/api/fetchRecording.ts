import { fetchApi } from '@/api/fetchApi'
import { ApiRoom } from '@/features/rooms/api/ApiRoom'
import { RecordingMode, RecordingStatus } from '@/features/recording'

export type RecordingApi = {
  id: string
  room: Pick<ApiRoom, 'id' | 'name' | 'slug' | 'access_level'>
  created_at: string
  key: string
  mode: RecordingMode
  status: RecordingStatus
  is_expired: boolean
  expired_at: string
  transcription_key: string | null
  has_transcription: boolean
}

export const fetchRecording = ({ recordingId }: { recordingId?: string }) => {
  return fetchApi<RecordingApi>(`/recordings/${recordingId}/`)
}
