import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import type { Language } from "@/types";
import { expandedLiteralTranslations } from "./expanded-translations";
import { translateRuntimePattern } from "./dynamic-translations";
import { interpolate, literalTranslations, messages } from "./translations";

interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
  greeting: (name: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "nightsafe-language";

type TextRecord = { source: string; rendered: string };
type AttributeRecord = Record<string, TextRecord>;

function storedLanguage(): Language {
  if (typeof window === "undefined") return "EN";
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === "ZH" || value === "TA" || value === "EN" ? value : "EN";
}

function messageLiteralDictionary(language: Language): Record<string, string> {
  const dictionary: Record<string, string> = {};
  for (const key of Object.keys(messages.EN)) {
    const source = messages.EN[key];
    const translated = messages[language][key] ?? source;
    if (source) dictionary[source] = translated;
  }
  return dictionary;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>(storedLanguage);
  const textRecords = useRef(new WeakMap<Text, TextRecord>());
  const attributeRecords = useRef(new WeakMap<Element, AttributeRecord>());

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  useEffect(() => {
    if (user?.language && user.language !== language) setLanguage(user.language);
  }, [user?.language, language, setLanguage]);

  const t = useCallback((key: string, values?: Record<string, string | number>) => {
    const template = messages[language][key] ?? messages.EN[key] ?? key;
    return interpolate(template, values);
  }, [language]);

  const greeting = useCallback((name: string) => {
    const hour = new Date().getHours();
    const key = hour < 12 ? "greeting.morning" : hour < 18 ? "greeting.afternoon" : "greeting.evening";
    return t(key, { name });
  }, [t]);

  useEffect(() => {
    document.documentElement.lang = language === "ZH" ? "zh-CN" : language === "TA" ? "ta" : "en";
    const dictionary = {
      ...messageLiteralDictionary(language),
      ...literalTranslations[language],
      ...expandedLiteralTranslations[language],
    };
    const textState = textRecords.current;
    const attributeState = attributeRecords.current;

    const translateLiteral = (value: string): string => {
      const trimmed = value.trim();
      const translated = dictionary[trimmed] ?? translateRuntimePattern(trimmed, language);
      return translated ? value.replace(trimmed, translated) : value;
    };

    const translateText = (node: Text) => {
      const parent = node.parentElement;
      if (!parent || parent.closest("[data-i18n-skip]")) return;
      const current = node.data;
      const previous = textState.get(node);
      const source = previous && current === previous.rendered ? previous.source : current;
      const rendered = translateLiteral(source);
      textState.set(node, { source, rendered });
      if (current !== rendered) node.data = rendered;
    };

    const translateAttributes = (element: Element) => {
      if (element.closest("[data-i18n-skip]")) return;
      const state = attributeState.get(element) ?? {};
      for (const attribute of ["placeholder", "title", "aria-label", "aria-description", "alt"] as const) {
        const current = element.getAttribute(attribute);
        if (!current) continue;
        const previous = state[attribute];
        const source = previous && current === previous.rendered ? previous.source : current;
        const rendered = translateLiteral(source);
        state[attribute] = { source, rendered };
        if (current !== rendered) element.setAttribute(attribute, rendered);
      }
      attributeState.set(element, state);
    };

    const translateTree = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        translateText(root as Text);
        return;
      }
      if (!(root instanceof Element) && root !== document.body) return;
      if (root instanceof Element) translateAttributes(root);
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      let current: Node | null = walker.nextNode();
      while (current) {
        if (current.nodeType === Node.TEXT_NODE) translateText(current as Text);
        else if (current instanceof Element) translateAttributes(current);
        current = walker.nextNode();
      }
    };

    translateTree(document.body);

    const originalAlert = window.alert.bind(window);
    const originalConfirm = window.confirm.bind(window);
    const originalPrompt = window.prompt.bind(window);
    window.alert = (message?: unknown) => originalAlert(translateLiteral(String(message ?? "")));
    window.confirm = (message?: string) => originalConfirm(translateLiteral(String(message ?? "")));
    window.prompt = (message?: string, defaultValue?: string) => originalPrompt(translateLiteral(String(message ?? "")), defaultValue);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") translateText(mutation.target as Text);
        if (mutation.type === "attributes" && mutation.target instanceof Element) translateAttributes(mutation.target);
        for (const node of mutation.addedNodes) translateTree(node);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label", "aria-description", "alt"],
    });

    return () => {
      observer.disconnect();
      window.alert = originalAlert;
      window.confirm = originalConfirm;
      window.prompt = originalPrompt;
    };
  }, [language]);

  const value = useMemo<I18nContextValue>(() => ({ language, setLanguage, t, greeting }), [language, setLanguage, t, greeting]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
