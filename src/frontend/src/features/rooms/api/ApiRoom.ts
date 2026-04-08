export type ApiLiveKit = {
  url: string
  room: string
  token: string
}

export enum ApiAccessLevel {
  PUBLIC = 'public',
  TRUSTED = 'trusted',
  RESTRICTED = 'restricted',
}

export type ApiRoom = {
  id: string
  name: string
  slug: string
  pin_code: string
  is_administrable: boolean
  access_level: ApiAccessLevel
  livekit?: ApiLiveKit
  configuration?: {
    [key: string]: string | number | boolean | string[]
  }
  scheduled_date?: string | null
  scheduled_time?: string | null
  has_ended_session?: boolean
  invited_emails?: string[]
}
