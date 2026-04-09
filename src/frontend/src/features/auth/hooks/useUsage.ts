import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/api/fetchApi'

type UsageData = {
  recordings_this_month: number
  transcriptions_this_month: number
  recording_limit: number | null
  transcription_limit: number | null
}

export const useUsage = () => {
  const { data } = useQuery({
    queryKey: ['usage'],
    queryFn: () => fetchApi<UsageData>('/users/me/usage/'),
    staleTime: 60_000,
  })

  const recordingLimitReached =
    data?.recording_limit !== null &&
    data !== undefined &&
    data.recordings_this_month >= (data.recording_limit ?? Infinity)

  const transcriptionLimitReached =
    data?.transcription_limit !== null &&
    data !== undefined &&
    data.transcriptions_this_month >= (data.transcription_limit ?? Infinity)

  return { data, recordingLimitReached, transcriptionLimitReached }
}
