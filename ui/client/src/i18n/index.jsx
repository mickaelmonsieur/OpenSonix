import { createContext, useContext, useState } from 'react'
import fr from './fr.js'
import en from './en.js'

const LANGS = { fr, en }

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
]

const LOCALES = { fr: 'fr-FR', en: 'en-GB' }

const I18nContext = createContext(null)

function resolve(obj, path) {
  const keys = path.split('.')
  let val = obj
  for (const k of keys) val = val?.[k]
  return typeof val === 'string' ? val : null
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(
    () => localStorage.getItem('lang') ?? 'en'
  )

  const setLang = (code) => {
    localStorage.setItem('lang', code)
    setLangState(code)
  }

  const translations = LANGS[lang] ?? LANGS.en

  const t = (path, vars = {}) => {
    const val = resolve(translations, path) ?? resolve(LANGS.en, path) ?? path
    return val.replace(/\{(\w+)\}/g, (_, k) =>
      vars[k] !== undefined ? String(vars[k]) : `{${k}}`
    )
  }

  const locale = LOCALES[lang] ?? 'en-GB'

  return (
    <I18nContext.Provider value={{ lang, setLang, t, locale }}>
      {children}
    </I18nContext.Provider>
  )
}

export const useI18n = () => useContext(I18nContext)
