import { useEffect, useState } from "react";

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

const HOME_SCREEN_MESSAGE = "提示：请把NightSafe加到主屏幕以得到更好的体验。Add NightSafe to Home Screen to get the best experience.";

function isPhoneDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));
}

function isStandalone(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as NavigatorWithStandalone).standalone);
}

export function HomeScreenExperienceBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const sync = () => setVisible(isPhoneDevice() && !isStandalone());

    sync();
    displayMode.addEventListener("change", sync);
    window.addEventListener("appinstalled", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);

    return () => {
      displayMode.removeEventListener("change", sync);
      window.removeEventListener("appinstalled", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className="sticky top-0 z-40 -mx-4 mb-5 overflow-hidden border-y border-sage-300/70 bg-midnight-700 shadow-subtle sm:-mx-6 lg:hidden"
      role="status"
      aria-label={HOME_SCREEN_MESSAGE}
      data-i18n-skip
    >
      <div className="nightsafe-home-screen-marquee whitespace-nowrap py-2.5 text-xs font-medium tracking-[0.01em] text-white">
        {HOME_SCREEN_MESSAGE}
      </div>
      <style>{`
        @keyframes nightsafe-home-screen-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-100%); }
        }
        .nightsafe-home-screen-marquee {
          display: inline-block;
          min-width: max-content;
          padding-left: 100%;
          animation: nightsafe-home-screen-marquee 16s linear infinite;
          will-change: transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .nightsafe-home-screen-marquee {
            padding-left: 1rem;
            padding-right: 1rem;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
