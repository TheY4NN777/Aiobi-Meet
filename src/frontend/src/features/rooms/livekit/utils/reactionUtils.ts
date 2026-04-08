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
  RiHand,
  RiFireLine,
  RiStarSmileLine,
  RiRocketLine,
  RiTrophyLine,
  RiCheckLine,
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
  'raised-hand': RiHand,
  'fire': RiFireLine,
  'star': RiStarSmileLine,
  'rocket': RiRocketLine,
  'trophy': RiTrophyLine,
  'check': RiCheckLine,
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
    'raised-hand': t('emojis.raised-hand', { defaultValue: 'raised hand' }),
    fire: t('emojis.fire', { defaultValue: 'fire' }),
    star: t('emojis.star', { defaultValue: 'star' }),
    rocket: t('emojis.rocket', { defaultValue: 'rocket' }),
    trophy: t('emojis.trophy', { defaultValue: 'trophy' }),
    check: t('emojis.check', { defaultValue: 'check' }),
  }
  return emojiLabels[emoji] ?? emoji
}
