import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function AuthenticatorQr({ uri }: { uri: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setSrc(null);
    setFailed(false);
    void QRCode.toDataURL(uri, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "M",
    })
      .then((value) => {
        if (active) setSrc(value);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [uri]);

  if (failed) {
    return <p className="text-sm text-ink/60">QR preview unavailable. Use the manual setup key below.</p>;
  }

  if (!src) {
    return <div className="h-[220px] w-[220px] animate-pulse rounded-card bg-sage-50" aria-label="Preparing authenticator QR code" />;
  }

  return (
    <img
      src={src}
      alt="Scan this QR code with Google Authenticator or another authenticator app"
      className="h-[220px] w-[220px] rounded-card border border-border bg-white p-2 shadow-subtle"
    />
  );
}
