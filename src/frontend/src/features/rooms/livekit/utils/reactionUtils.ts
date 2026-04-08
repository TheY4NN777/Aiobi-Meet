import { useTranslation } from 'react-i18next'
import {
  RiThumbUpLine,
  RiThumbDownLine,
  RiShakeHandsLine,
  RiHeartLine,
  RiEmotionLaughLine,
  RiEmotion2Line,
  RiSparklingLine,
  RiHandHeartLine,
} from '@remixicon/react'
import type { RemixiconComponentType } from '@remixicon/react'

export const emojiIcons: Record<string, RemixiconComponentType> = {
  'thumbs-up': RiThumbUpLine,
  'thumbs-down': RiThumbDownLine,
  'clapping-hands': RiShakeHandsLine,
  'red-heart': RiHeartLine,
  'face-with-tears-of-joy': RiEmotionLaughLine,
  'face-with-open-mouth': RiEmotion2Line,
  'party-popper': RiSparklingLine,
  'folded-hands': RiHandHeartLine,
}

export const getEmojiLabel = (
  emoji: string,
  t: ReturnType<typeof useTranslation>['t']
) => {
  const emojiLabels: Record<string, string> = {
    'thumbs-up': t('emojis.thumbs-up', { defaultValue: 'thumbs up' }),
    'thumbs-down': t('emojis.thumbs-down', { defaultValue: 'thumbs down' }),
    'clapping-hands': t('emojis.clapping-hands', {
      defaultValue: 'clapping hands',
    }),
    'red-heart': t('emojis.red-heart', { defaultValue: 'red heart' }),
    'face-with-tears-of-joy': t('emojis.face-with-tears-of-joy', {
      defaultValue: 'face with tears of joy',
    }),
    'face-with-open-mouth': t('emojis.face-with-open-mouth', {
      defaultValue: 'surprised face',
    }),
    'party-popper': t('emojis.party-popper', { defaultValue: 'party popper' }),
    'folded-hands': t('emojis.folded-hands', { defaultValue: 'folded hands' }),
  }
  return emojiLabels[emoji] ?? emoji
}
