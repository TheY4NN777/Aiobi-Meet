import { fetchApi } from '@/api/fetchApi'

export type RoomParticipantApi = {
  id: string
  livekit_identity: string
  display_name: string
  full_name: string
  joined_at: string
  left_at: string | null
}

export type SessionRecordingApi = {
  id: string
  mode: string
  status: string
  key: string
  transcription_key: string | null
  has_transcription: boolean
  is_expired: boolean
}

export type RoomSessionApi = {
  id: string
  room: { id: string; name: string; slug: string }
  started_at: string
  ended_at: string | null
  duration: number | null
  participant_count: number
  participants: RoomParticipantApi[]
  recordings: SessionRecordingApi[]
}

export const fetchRoomSessions = (archived = false) =>
  fetchApi<{ results: RoomSessionApi[] }>(`/room-sessions/${archived ? '?archived=true' : ''}`)
