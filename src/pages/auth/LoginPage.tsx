import { ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-input bg-midnight-600">
            <ShieldCheck className="h-6 w-6 text-sage-200" />
          </div>
          <h1 className="text-lg font-semibold text-midnight-800">NightSafe</h1>
          <p className="text-sm text-midnight-500/70">Your space. Managed with care.</p>
        </div>

        <form className="flex flex-col gap-4">
          <Input label="Email" type="email" placeholder="you@example.com" />
          <Input label="Password" type="password" placeholder="••••••••" />
          <Button type="submit" className="mt-2 w-full">
            Sign in
          </Button>
        </form>
      </Card>
    </div>
  );
}
