import { getLocale } from '../i18n/i18n.js'
import { zhStoryContent } from './locales/zh/storyContent.js'
import { mainStoryContent } from '../story/mainStoryContent.js'

export function getLocalizedStoryContent(locale = getLocale()) {
  if (locale === 'zh') {
    return zhStoryContent
  }

  return mainStoryContent
}
