import {
  FeedbackRoute,
  RoomRoute,
  flexibleRoomIdPattern,
} from '@/features/rooms'
import { HomeRoute, DashboardRoute } from '@/features/home'
import { MeetingsRoute } from '@/features/meetings'
import { LegalTermsRoute } from '@/features/legalsTerms/LegalTermsRoute'
import { TermsOfServiceRoute } from '@/features/legalsTerms/TermsOfService'
import { CreatePopup } from '@/features/sdk/routes/CreatePopup'
import { CreateMeetingButton } from '@/features/sdk/routes/CreateMeetingButton'
import { RecordingDownloadRoute } from '@/features/recording'
import { ReleaseNotesRoute } from '@/features/releaseNotes/ReleaseNotes'

const roomIdRegex = new RegExp(`^[/](?<roomId>${flexibleRoomIdPattern})$`)

export const routes: Record<
  | 'landing'
  | 'home'
  | 'meetings'
  | 'room'
  | 'feedback'
  | 'legalTerms'
  | 'termsOfService'
  | 'sdkCreatePopup'
  | 'sdkCreateButton'
  | 'releaseNotes'
  | 'recordingDownload',
  {
    name: RouteName
    path: RegExp | string
    Component: () => JSX.Element
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    to?: (...args: any[]) => string | URL
  }
> = {
  landing: {
    name: 'landing',
    path: '/',
    Component: HomeRoute,
  },
  home: {
    name: 'home',
    path: '/home',
    Component: DashboardRoute,
  },
  meetings: {
    name: 'meetings',
    path: '/meetings',
    Component: MeetingsRoute,
  },
  room: {
    name: 'room',
    to: (roomId: string) => `/${roomId.trim()}`,
    path: roomIdRegex,
    Component: RoomRoute,
  },
  feedback: {
    name: 'feedback',
    path: '/feedback',
    Component: FeedbackRoute,
  },
  legalTerms: {
    name: 'legalTerms',
    path: '/politique-confidentialite',
    Component: LegalTermsRoute,
  },
  termsOfService: {
    name: 'termsOfService',
    path: '/conditions-utilisation',
    Component: TermsOfServiceRoute,
  },
  sdkCreatePopup: {
    name: 'sdkCreatePopup',
    path: '/sdk/create-popup',
    Component: CreatePopup,
  },
  sdkCreateButton: {
    name: 'sdkCreateButton',
    path: '/sdk/create-button',
    Component: CreateMeetingButton,
  },
  releaseNotes: {
    name: 'releaseNotes',
    path: '/release-notes',
    Component: ReleaseNotesRoute,
  },
  recordingDownload: {
    name: 'recordingDownload',
    path: /^\/recording\/(?<recordingId>[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
    to: (recordingId: string) => `/recording/${recordingId.trim()}`,
    Component: RecordingDownloadRoute,
  },
}

export type RouteName = keyof typeof routes
