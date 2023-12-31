import Vue from 'vue'
import VueI18n from 'vue-i18n'
const Store = require('electron-store')
const store = new Store()
import { formatLocale } from "../utils"

Vue.use(VueI18n)

let initLocale = store.get('selectedLocale') || navigator.language || 'en'

let i18n = new VueI18n({
  locale: formatLocale(initLocale),
  fallbackLocale: 'en',
  silentFallbackWarn: true,
  silentTranslationWarn: true,
})

export default i18n