import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { CheckCircle2, KeyRound, Laptop, MailCheck, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/i18n/I18nProvider";
import { LANGUAGE_OPTIONS, ROLE_HOME } from "@/i18n/translations";
import type { AuthUser, Language } from "@/types";
import { AuthenticatorQr } from "@/components/account/AuthenticatorQr";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";

interface DeviceSession {
  id: string;
  name: string;
  userAgent: string | null;
  country: string | null;
  lastSeenAt: string;
  createdAt: string;
  current: boolean;
}

type Feedback = { type: "success" | "error"; text: string } | null;

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={feedback.type === "error" ? "text-sm text-status-overdue" : "text-sm text-status-confirmed"}>
      {feedback.text}
    </p>
  );
}

export function SettingsPage() {
  const { user, refresh } = useAuth();
  const { language, setLanguage, t } = useI18n();
  const navigate = useNavigate();

  const [nickname, setNickname] = useState(user?.nickname ?? "");
  const [nicknameFeedback, setNicknameFeedback] = useState<Feedback>(null);
  const [nicknameSaving, setNicknameSaving] = useState(false);

  const [passwordFeedback, setPasswordFeedback] = useState<Feedback>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const [emailChallenge, setEmailChallenge] = useState<string | null>(null);
  const [emailTarget, setEmailTarget] = useState("");
  const [emailSentTo, setEmailSentTo] = useState("");
  const [emailFeedback, setEmailFeedback] = useState<Feedback>(null);
  const [emailSaving, setEmailSaving] = useState(false);

  const [phoneChallenge, setPhoneChallenge] = useState<string | null>(null);
  const [phoneTarget, setPhoneTarget] = useState("");
  const [phoneSentTo, setPhoneSentTo] = useState("");
  const [phoneFeedback, setPhoneFeedback] = useState<Feedback>(null);
  const [phoneSaving, setPhoneSaving] = useState(false);

  const [twoFactorSecret, setTwoFactorSecret] = useState<string | null>(null);
  const [twoFactorUri, setTwoFactorUri] = useState<string | null>(null);
  const [twoFactorFeedback, setTwoFactorFeedback] = useState<Feedback>(null);
  const [twoFactorSaving, setTwoFactorSaving] = useState(false);

  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [deviceFeedback, setDeviceFeedback] = useState<Feedback>(null);

  useEffect(() => setNickname(user?.nickname ?? ""), [user?.nickname]);

  async function loadDevices() {
    setDevicesLoading(true);
    try {
      const response = await api.get<{ devices: DeviceSession[] }>("/api/account/devices");
      setDevices(response.devices);
    } catch (error) {
      setDeviceFeedback({ type: "error", text: messageFrom(error, "Couldn't load active devices.") });
    } finally {
      setDevicesLoading(false);
    }
  }

  useEffect(() => { void loadDevices(); }, []);

  if (!user) return null;

  async function changeLanguage(next: Language) {
    try {
      await api.patch<{ user: AuthUser }>("/api/account/language", { language: next });
      setLanguage(next);
      await refresh();
      navigate(ROLE_HOME[user!.role], { replace: true });
    } catch (error) {
      setNicknameFeedback({ type: "error", text: messageFrom(error, "Couldn't update the language.") });
    }
  }

  async function saveNickname(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNicknameSaving(true);
    setNicknameFeedback(null);
    try {
      await api.patch("/api/account/nickname", { nickname });
      await refresh();
      setNicknameFeedback({ type: "success", text: t("settings.nicknameSaved") });
    } catch (error) {
      setNicknameFeedback({ type: "error", text: messageFrom(error, "Couldn't update your nickname.") });
    } finally {
      setNicknameSaving(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    setPasswordFeedback(null);
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", text: t("settings.passwordMismatch") });
      return;
    }
    setPasswordSaving(true);
    try {
      await api.post("/api/account/password", { currentPassword, newPassword });
      event.currentTarget.reset();
      setPasswordFeedback({ type: "success", text: t("settings.passwordSaved") });
      await loadDevices();
    } catch (error) {
      setPasswordFeedback({ type: "error", text: messageFrom(error, "Couldn't change your password.") });
    } finally {
      setPasswordSaving(false);
    }
  }

  async function requestEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const currentPassword = String(form.get("currentPassword") ?? "");
    setEmailSaving(true);
    setEmailFeedback(null);
    try {
      const response = await api.post<{ challengeId: string; sentTo: string }>("/api/account/email/request", { email, currentPassword });
      setEmailChallenge(response.challengeId);
      setEmailTarget(email);
      setEmailSentTo(response.sentTo);
      setEmailFeedback({ type: "success", text: `Verification code sent to ${response.sentTo}.` });
    } catch (error) {
      setEmailFeedback({ type: "error", text: messageFrom(error, "Couldn't send the verification code.") });
    } finally {
      setEmailSaving(false);
    }
  }

  async function confirmEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    if (!emailChallenge) return;
    setEmailSaving(true);
    setEmailFeedback(null);
    try {
      await api.post("/api/account/email/confirm", { challengeId: emailChallenge, code });
      setEmailChallenge(null);
      setEmailTarget("");
      setEmailSentTo("");
      await refresh();
      await loadDevices();
      setEmailFeedback({ type: "success", text: t("settings.emailSaved") });
    } catch (error) {
      setEmailFeedback({ type: "error", text: messageFrom(error, "Couldn't verify the new email address.") });
    } finally {
      setEmailSaving(false);
    }
  }

  async function requestPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const phone = String(form.get("phone") ?? "");
    const currentPassword = String(form.get("currentPassword") ?? "");
    setPhoneSaving(true);
    setPhoneFeedback(null);
    try {
      const response = await api.post<{ challengeId: string; sentTo: string }>("/api/account/phone/request", { phone, currentPassword });
      setPhoneChallenge(response.challengeId);
      setPhoneTarget(phone);
      setPhoneSentTo(response.sentTo);
      setPhoneFeedback({ type: "success", text: `Verification code sent to ${response.sentTo}.` });
    } catch (error) {
      setPhoneFeedback({ type: "error", text: messageFrom(error, "Couldn't send the verification code.") });
    } finally {
      setPhoneSaving(false);
    }
  }

  async function confirmPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    if (!phoneChallenge) return;
    setPhoneSaving(true);
    setPhoneFeedback(null);
    try {
      await api.post("/api/account/phone/confirm", { challengeId: phoneChallenge, code });
      setPhoneChallenge(null);
      setPhoneTarget("");
      setPhoneSentTo("");
      await refresh();
      setPhoneFeedback({ type: "success", text: t("settings.phoneSaved") });
    } catch (error) {
      setPhoneFeedback({ type: "error", text: messageFrom(error, "Couldn't verify the phone number.") });
    } finally {
      setPhoneSaving(false);
    }
  }

  async function startTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentPassword = String(new FormData(event.currentTarget).get("currentPassword") ?? "");
    setTwoFactorSaving(true);
    setTwoFactorFeedback(null);
    try {
      const response = await api.post<{ secret: string; uri: string }>("/api/account/two-factor/setup", { currentPassword });
      setTwoFactorSecret(response.secret);
      setTwoFactorUri(response.uri);
    } catch (error) {
      setTwoFactorFeedback({ type: "error", text: messageFrom(error, "Couldn't start two-factor setup.") });
    } finally {
      setTwoFactorSaving(false);
    }
  }

  async function enableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setTwoFactorSaving(true);
    setTwoFactorFeedback(null);
    try {
      await api.post("/api/account/two-factor/enable", { code });
      setTwoFactorSecret(null);
      setTwoFactorUri(null);
      await refresh();
      await loadDevices();
      setTwoFactorFeedback({ type: "success", text: t("settings.twoFactorSaved") });
    } catch (error) {
      setTwoFactorFeedback({ type: "error", text: messageFrom(error, "Couldn't enable two-factor authentication.") });
    } finally {
      setTwoFactorSaving(false);
    }
  }

  async function disableTwoFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setTwoFactorSaving(true);
    setTwoFactorFeedback(null);
    try {
      await api.delete("/api/account/two-factor", {
        currentPassword: String(form.get("currentPassword") ?? ""),
        code: String(form.get("code") ?? ""),
      });
      event.currentTarget.reset();
      await refresh();
      setTwoFactorFeedback({ type: "success", text: t("settings.twoFactorDisabled") });
    } catch (error) {
      setTwoFactorFeedback({ type: "error", text: messageFrom(error, "Couldn't disable two-factor authentication.") });
    } finally {
      setTwoFactorSaving(false);
    }
  }

  async function signOutDevice(device: DeviceSession) {
    if (device.current) return;
    setDeviceFeedback(null);
    try {
      await api.delete(`/api/account/devices/${encodeURIComponent(device.id)}`);
      setDeviceFeedback({ type: "success", text: t("settings.deviceSignedOut") });
      await loadDevices();
    } catch (error) {
      setDeviceFeedback({ type: "error", text: messageFrom(error, "Couldn't sign out that device.") });
    }
  }

  const displayName = user.nickname?.trim() || user.name;
  return (
    <div className="animate-fade-in-up space-y-5">
      <PageHeader title={t("settings.title")} description={t("settings.description")} />

      <Card className="overflow-hidden p-0">
        <div className="bg-gradient-to-r from-sage-100 via-card to-[#F7E8D7] p-5 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-white/80 bg-white/80 shadow-subtle">
              <UserRound className="h-8 w-8 text-sage-700" />
            </div>
            <div className="min-w-0" data-i18n-skip>
              <p className="truncate text-lg font-semibold text-ink">{displayName}</p>
              <p className="truncate text-sm text-ink/60">{user.email}</p>
              <p className="mt-1 text-xs text-ink/50">{user.role.replaceAll("_", " ")}</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-ink/60">{t("settings.profileDescription")}</p>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-ink">{t("settings.nickname")}</h2>
          <p className="mt-1 text-sm text-ink/60">{t("settings.nicknameHint")}</p>
          <form className="mt-4 space-y-3" onSubmit={saveNickname}>
            <Input value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={32} autoComplete="nickname" required />
            <FeedbackLine feedback={nicknameFeedback} />
            <Button type="submit" size="sm" loading={nicknameSaving}>{t("common.save")}</Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">{t("settings.language")}</h2>
          <p className="mt-1 text-sm text-ink/60">{t("settings.languageDescription")}</p>
          <div className="mt-4">
            <Select value={language} onChange={(event) => void changeLanguage(event.target.value as Language)}>
              {LANGUAGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-semibold text-ink">{t("settings.securityChecklist")}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SecurityStatus icon={MailCheck} label={t("settings.verifiedEmail")} complete={user.emailVerified} completeText={t("settings.complete")} incompleteText={t("settings.incomplete")} />
          <SecurityStatus icon={Phone} label={t("settings.verifiedPhone")} complete={user.phoneVerified} completeText={t("settings.complete")} incompleteText={t("settings.incomplete")} />
          <SecurityStatus icon={ShieldCheck} label={t("settings.authenticator")} complete={user.twoFactorEnabled} completeText={t("settings.complete")} incompleteText={t("settings.incomplete")} />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="font-semibold text-ink">{t("settings.password")}</h2>
          <p className="mt-1 text-sm text-ink/60">{t("settings.passwordDescription")}</p>
          <form className="mt-4 space-y-3" onSubmit={changePassword}>
            <Input name="currentPassword" label={t("common.currentPassword")} type="password" autoComplete="current-password" required />
            <Input name="newPassword" label={t("common.newPassword")} type="password" minLength={8} autoComplete="new-password" required />
            <Input name="confirmPassword" label={t("common.confirmPassword")} type="password" minLength={8} autoComplete="new-password" required />
            <FeedbackLine feedback={passwordFeedback} />
            <Button type="submit" size="sm" loading={passwordSaving} icon={<KeyRound className="h-4 w-4" />}>{t("settings.changePassword")}</Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">{t("settings.email")}</h2>
          <p className="mt-1 text-sm text-ink/60">{t("settings.emailDescription")}</p>
          <p className="mt-3 rounded-input bg-sage-50 px-3 py-2 text-sm text-ink/70" data-i18n-skip>{user.email} · {user.emailVerified ? t("settings.emailVerified") : t("settings.emailNotVerified")}</p>
          {!emailChallenge ? (
            <form className="mt-4 space-y-3" onSubmit={requestEmail}>
              <Input name="email" label={t("settings.newEmail")} type="email" autoComplete="email" required />
              <Input name="currentPassword" label={t("common.currentPassword")} type="password" autoComplete="current-password" required />
              <FeedbackLine feedback={emailFeedback} />
              <Button type="submit" size="sm" loading={emailSaving}>{t("settings.sendEmailCode")}</Button>
            </form>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={confirmEmail}>
              <p className="text-sm text-ink/60" data-i18n-skip>{emailTarget} · code sent to {emailSentTo}</p>
              <Input name="code" label={t("common.verificationCode")} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
              <FeedbackLine feedback={emailFeedback} />
              <div className="flex gap-2"><Button type="submit" size="sm" loading={emailSaving}>{t("common.verify")}</Button><Button type="button" size="sm" variant="secondary" onClick={() => setEmailChallenge(null)}>{t("common.cancel")}</Button></div>
            </form>
          )}
        </Card>

        <Card>
          <h2 className="font-semibold text-ink">{t("settings.phone")}</h2>
          <p className="mt-1 text-sm text-ink/60">{t("settings.phoneDescription")}</p>
          <p className="mt-3 rounded-input bg-sage-50 px-3 py-2 text-sm text-ink/70" data-i18n-skip>{user.phone || t("settings.phoneNotAdded")} {user.phoneVerified ? `· ${t("settings.complete")}` : ""}</p>
          {!phoneChallenge ? (
            <form className="mt-4 space-y-3" onSubmit={requestPhone}>
              <Input name="phone" label={t("settings.newPhone")} type="tel" placeholder="+60123456789" autoComplete="tel" required />
              <Input name="currentPassword" label={t("common.currentPassword")} type="password" autoComplete="current-password" required />
              <FeedbackLine feedback={phoneFeedback} />
              <Button type="submit" size="sm" loading={phoneSaving} disabled={!user.emailVerified}>{t("settings.sendPhoneCode")}</Button>
            </form>
          ) : (
            <form className="mt-4 space-y-3" onSubmit={confirmPhone}>
              <p className="text-sm text-ink/60" data-i18n-skip>{phoneTarget} · code sent to {phoneSentTo}</p>
              <Input name="code" label={t("common.verificationCode")} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
              <FeedbackLine feedback={phoneFeedback} />
              <div className="flex gap-2"><Button type="submit" size="sm" loading={phoneSaving}>{t("common.verify")}</Button><Button type="button" size="sm" variant="secondary" onClick={() => setPhoneChallenge(null)}>{t("common.cancel")}</Button></div>
            </form>
          )}
        </Card>
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-100"><ShieldCheck className="h-5 w-5 text-sage-700" /></div>
          <div><h2 className="font-semibold text-ink">{t("settings.twoFactor")}</h2><p className="mt-1 text-sm text-ink/60">{t("settings.twoFactorDescription")}</p></div>
        </div>
        {!user.twoFactorEnabled ? (
          !twoFactorSecret ? (
            <form className="mt-4 max-w-md space-y-3" onSubmit={startTwoFactor}>
              <Input name="currentPassword" label={t("common.currentPassword")} type="password" autoComplete="current-password" required />
              <FeedbackLine feedback={twoFactorFeedback} />
              <Button type="submit" size="sm" loading={twoFactorSaving}>{t("settings.setup2fa")}</Button>
            </form>
          ) : (
            <form className="mt-4 max-w-2xl space-y-4" onSubmit={enableTwoFactor}>
              <p className="text-sm text-ink/60">{t("settings.authenticatorInstructions")}</p>
              <div className="grid gap-4 sm:grid-cols-[220px_1fr] sm:items-start">
                {twoFactorUri && <AuthenticatorQr uri={twoFactorUri} />}
                <div className="space-y-3">
                  <div className="rounded-input border border-border bg-canvas p-3" data-i18n-skip>
                    <p className="text-xs text-ink/50">Manual setup key</p>
                    <code className="mt-1 block break-all font-mono text-sm font-semibold tracking-wide text-ink">{twoFactorSecret}</code>
                  </div>
                  {twoFactorUri && <a href={twoFactorUri} className="inline-flex text-sm font-medium text-sage-700 underline underline-offset-4">Open in authenticator app</a>}
                  <p className="text-xs leading-relaxed text-ink/50">Scan the QR code with Google Authenticator or another compatible authenticator app. If scanning is unavailable, enter the manual setup key instead.</p>
                </div>
              </div>
              <Input name="code" label={t("common.verificationCode")} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
              <FeedbackLine feedback={twoFactorFeedback} />
              <div className="flex gap-2"><Button type="submit" size="sm" loading={twoFactorSaving}>{t("settings.enable2fa")}</Button><Button type="button" size="sm" variant="secondary" onClick={() => { setTwoFactorSecret(null); setTwoFactorUri(null); }}>{t("common.cancel")}</Button></div>
            </form>
          )
        ) : (
          <form className="mt-4 max-w-md space-y-3" onSubmit={disableTwoFactor}>
            <div className="flex items-center gap-2 text-sm font-medium text-status-confirmed"><CheckCircle2 className="h-4 w-4" />{t("common.enabled")}</div>
            <Input name="currentPassword" label={t("common.currentPassword")} type="password" autoComplete="current-password" required />
            <Input name="code" label={t("common.verificationCode")} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
            <FeedbackLine feedback={twoFactorFeedback} />
            <Button type="submit" size="sm" variant="secondary" loading={twoFactorSaving}>{t("settings.disable2fa")}</Button>
          </form>
        )}
      </Card>

      <Card>
        <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage-100"><Laptop className="h-5 w-5 text-sage-700" /></div><div><h2 className="font-semibold text-ink">{t("settings.devices")}</h2><p className="mt-1 text-sm text-ink/60">{t("settings.devicesDescription")}</p></div></div>
        <FeedbackLine feedback={deviceFeedback} />
        <div className="mt-4 divide-y divide-border rounded-card border border-border bg-white/70">
          {devicesLoading ? <p className="p-4 text-sm text-ink/50">Loading…</p> : devices.length === 0 ? <p className="p-4 text-sm text-ink/50">{t("settings.noDevices")}</p> : devices.map((device) => (
            <div key={device.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><p className="font-medium text-ink" data-i18n-skip>{device.name}</p>{device.current && <span className="rounded-full bg-sage-100 px-2 py-0.5 text-xs font-medium text-sage-800">{t("common.currentDevice")}</span>}</div>
                <p className="mt-1 text-xs text-ink/50" data-i18n-skip>{device.country ? `${device.country} · ` : ""}{t("settings.lastSeen")} {new Date(device.lastSeenAt).toLocaleString()}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={device.current} onClick={() => void signOutDevice(device)}>{t("settings.signOutDevice")}</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function SecurityStatus({ icon: Icon, label, complete, completeText, incompleteText }: { icon: typeof MailCheck; label: string; complete: boolean; completeText: string; incompleteText: string }) {
  return (
    <div className="flex items-center gap-3 rounded-card border border-border bg-white/60 p-3">
      <div className={complete ? "flex h-9 w-9 items-center justify-center rounded-full bg-status-confirmed/10 text-status-confirmed" : "flex h-9 w-9 items-center justify-center rounded-full bg-status-waiting/10 text-status-waiting"}><Icon className="h-4 w-4" /></div>
      <div><p className="text-sm font-medium text-ink">{label}</p><p className="text-xs text-ink/50">{complete ? completeText : incompleteText}</p></div>
    </div>
  );
}
