import { useEffect, useState } from "react";
import { BellRing, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n/I18nProvider";
import {
  getSystemNotificationPermission,
  getSystemNotificationPreference,
  isIOSDevice,
  isStandaloneApp,
  requestSystemNotificationPermission,
  setSystemNotificationPreference,
  systemNotificationsSupported,
  type SystemNotificationPermission,
} from "@/lib/system-notifications";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type Feedback = { type: "success" | "error"; text: string } | null;

export function NotificationSettingsCard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<SystemNotificationPermission>(getSystemNotificationPermission);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);

  function syncState() {
    if (!user) return;
    setEnabled(getSystemNotificationPreference(user.id));
    setPermission(getSystemNotificationPermission());
  }

  useEffect(() => {
    syncState();
    window.addEventListener("focus", syncState);
    return () => window.removeEventListener("focus", syncState);
  }, [user?.id]);

  if (!user) return null;

  const isIOS = isIOSDevice();
  const isStandalone = isStandaloneApp();
  const supported = systemNotificationsSupported();
  const effectiveEnabled = enabled && permission === "granted";

  let guidance = effectiveEnabled
    ? "Notifications are on for this device."
    : "Notifications are off for this device.";
  if (isIOS && !isStandalone) {
    guidance = "On iPhone or iPad, add NightSafe to your Home Screen first. Then open the installed NightSafe app and enable notifications here.";
  } else if (!supported) {
    guidance = "System notifications aren't supported in this browser.";
  } else if (permission === "denied") {
    guidance = "Notifications are blocked by your browser or device. Allow NightSafe notifications in system settings, then try again.";
  }

  async function turnOn() {
    setSaving(true);
    setFeedback(null);
    try {
      if (isIOSDevice() && !isStandaloneApp()) {
        setFeedback({
          type: "error",
          text: "On iPhone or iPad, add NightSafe to your Home Screen first. Then open the installed NightSafe app and enable notifications here.",
        });
        return;
      }
      if (!systemNotificationsSupported()) {
        setFeedback({ type: "error", text: "System notifications aren't supported in this browser." });
        return;
      }
      const nextPermission = await requestSystemNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission !== "granted") {
        setSystemNotificationPreference(user.id, false);
        setEnabled(false);
        setFeedback({
          type: "error",
          text: nextPermission === "denied"
            ? "Notifications are blocked by your browser or device. Allow NightSafe notifications in system settings, then try again."
            : "Notification permission wasn't granted.",
        });
        return;
      }
      setSystemNotificationPreference(user.id, true);
      setEnabled(true);
      setFeedback({ type: "success", text: "Notifications turned on for this device." });
    } finally {
      setSaving(false);
    }
  }

  function turnOff() {
    setSystemNotificationPreference(user.id, false);
    setEnabled(false);
    setFeedback({ type: "success", text: "Notifications turned off for this device." });
  }

  return (
    <Card id="notifications" className="scroll-mt-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-100">
            <BellRing className="h-5 w-5 text-sage-700" />
          </div>
          <div>
            <h2 className="font-semibold text-ink">Notifications</h2>
            <p className="mt-1 text-sm text-ink/60">Control system alerts on this device.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${effectiveEnabled ? "bg-status-confirmed/10 text-status-confirmed" : "bg-ink/5 text-ink/55"}`}>
            {effectiveEnabled && <CheckCircle2 className="h-3.5 w-3.5" />}
            {effectiveEnabled ? t("common.enabled") : t("common.disabled")}
          </span>
          {effectiveEnabled ? (
            <Button type="button" size="sm" variant="secondary" onClick={turnOff}>Turn off notifications</Button>
          ) : (
            <Button type="button" size="sm" loading={saving} onClick={() => void turnOn()}>Turn on notifications</Button>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-input border border-sage-200 bg-sage-50/60 px-3 py-3">
        <p className="text-sm leading-relaxed text-ink/70">NightSafe can show new messages in your phone or computer notification center.</p>
        <p className="mt-1 text-xs leading-relaxed text-ink/55">{guidance}</p>
      </div>

      {feedback && (
        <p className={`mt-3 text-sm ${feedback.type === "error" ? "text-status-overdue" : "text-status-confirmed"}`}>
          {feedback.text}
        </p>
      )}
    </Card>
  );
}
