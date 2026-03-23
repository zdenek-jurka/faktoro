import '@formatjs/intl-locale/polyfill-force.js';
import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/cs.js';
import '@formatjs/intl-pluralrules/locale-data/de.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/es.js';
import '@formatjs/intl-pluralrules/locale-data/fr.js';
import '@formatjs/intl-pluralrules/locale-data/pl.js';
import '@formatjs/intl-pluralrules/locale-data/pt.js';

import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Locales, TranslationFunctions } from './i18n-types';
import { baseLocale, i18nObject } from './i18n-util';
import { loadAllLocales } from './i18n-util.sync';

loadAllLocales();

type I18nContextType = {
  locale: Locales;
  LL: TranslationFunctions;
  setLocale: (locale: Locales) => void;
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

type TypesafeI18nProps = {
  locale: Locales;
  children: ReactNode;
};

export const TypesafeI18n: React.FC<TypesafeI18nProps> = ({ locale: initialLocale, children }) => {
  const [locale, setLocaleState] = useState<Locales>(initialLocale || baseLocale);
  const initialLocaleRef = useRef<Locales>(initialLocale || baseLocale);

  useEffect(() => {
    if (initialLocale && initialLocale !== initialLocaleRef.current) {
      initialLocaleRef.current = initialLocale;
      setLocaleState(initialLocale);
    }
  }, [initialLocale]);

  const LL = useMemo(() => i18nObject(locale), [locale]);

  return (
    <I18nContext.Provider value={{ locale, LL, setLocale: setLocaleState }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18nContext = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18nContext must be used within TypesafeI18n provider');
  }
  return context;
};
