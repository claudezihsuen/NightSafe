import type { Language } from "@/types";
import { expandedZh } from "./expanded-zh";
import { expandedTa } from "./expanded-ta";
import { expandedExtraZh, expandedExtraTa } from "./expanded-extra";
import { dynamicLiteralTranslations } from "./dynamic-translations";

export const expandedLiteralTranslations: Record<Language, Record<string, string>> = {
  EN: {},
  ZH: { ...expandedZh, ...expandedExtraZh, ...dynamicLiteralTranslations.ZH },
  TA: { ...expandedTa, ...expandedExtraTa, ...dynamicLiteralTranslations.TA },
};
