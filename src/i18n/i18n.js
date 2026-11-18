import { eventBus } from '../utils/event-bus.js'
import en from './locales/en.js'
import zh from './locales/zh.js'

export const LOCALE_CHANGED_EVENT = 'i18n:locale-changed'
export const SUPPORTED_LOCALES = ['en', 'zh']
const STORAGE_KEY = 'locale'

const catalogs = { en, zh }

let currentLocale = 'en'

function resolveInitialLocale() {
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored && catalogs[stored]) {
      return stored
    }
  }

  if (typeof navigator !== 'undefined') {
    const language = navigator.language?.toLowerCase() ?? ''
    if (language.startsWith('zh')) {
      return 'zh'
    }
  }

  return 'en'
}

export function initI18n() {
  currentLocale = resolveInitialLocale()
  return currentLocale
}

export function getLocale() {
  return currentLocale
}

export function getSupportedLocales() {
  return [...SUPPORTED_LOCALES]
}

export function getLocaleLabel(locale = currentLocale) {
  return catalogs[locale]?.meta?.label ?? locale
}

export function setLocale(locale) {
  if (!catalogs[locale] || locale === currentLocale) {
    return false
  }

  currentLocale = locale
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, locale)
  }
  eventBus.emit(LOCALE_CHANGED_EVENT, { locale })
  return true
}

export function getMessages(key) {
  const parts = key.split('.')
  let value = catalogs[currentLocale]

  for (const part of parts) {
    value = value?.[part]
  }

  if (value === undefined && currentLocale !== 'en') {
    value = catalogs.en
    for (const part of parts) {
      value = value?.[part]
    }
  }

  return value
}

export function t(key, params = {}) {
  const parts = key.split('.')
  let value = catalogs[currentLocale]

  for (const part of parts) {
    value = value?.[part]
  }

  if (typeof value !== 'string' && currentLocale !== 'en') {
    value = catalogs.en
    for (const part of parts) {
      value = value?.[part]
    }
  }

  if (typeof value !== 'string') {
    return key
  }

  return value.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? `{${name}}`)
}

if (typeof window !== 'undefined') {
  initI18n()
}
