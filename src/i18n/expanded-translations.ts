import type { Language } from "@/types";
import { expandedZh } from "./expanded-zh";
import { expandedTa } from "./expanded-ta";

export const expandedLiteralTranslations: Record<Language, Record<string, string>> = {
  EN: {},
  ZH: expandedZh,
  TA: expandedTa,
};
