import { useMutation, UseMutationOptions } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'
import { ApiError } from '@/api/ApiError'

export interface InviteToRoomParams {
  roomId: string
  emails: string[]
  scheduledDate?: string | null
  scheduledTime?: string | null
  timezone?: string
}

export interface InviteToRoomResponse {
  status: string
  message: string
}

const inviteToRoom = async ({
  roomId,
  emails,
  scheduledDate,
  scheduledTime,
  timezone,
}: InviteToRoomParams): Promise<InviteToRoomResponse> => {
  return fetchApi<InviteToRoomResponse>(`rooms/${roomId}/invite/`, {
    method: 'POST',
    body: JSON.stringify({
      emails,
      scheduled_date: scheduledDate || null,
      scheduled_time: scheduledTime || null,
      timezone: timezone || '',
    }),
  })
}

export function useInviteToRoom(
  options?: UseMutationOptions<
    InviteToRoomResponse,
    ApiError,
    InviteToRoomParams
  >
) {
  return useMutation<InviteToRoomResponse, ApiError, InviteToRoomParams>({
    mutationFn: inviteToRoom,
    ...options,
  })
}
