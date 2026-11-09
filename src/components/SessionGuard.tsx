import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import LoginForm from '@/components/LoginForm';
import { markSessionRestored, SESSION_EXPIRED_EVENT, startSessionKeepAlive } from '@/lib/api';
import { useSaveStatus } from '@/lib/saveStatus';

/**
 * Gdy sesja wygaśnie, pokazuje logowanie NAD aplikacją — kalendarz, otwarte formularze
 * i niezapisane zmiany zostają na miejscu i są wysyłane zaraz po zalogowaniu.
 */
export default function SessionGuard() {
  const [open, setOpen] = useState(false);
  const { pending } = useSaveStatus();

  useEffect(() => {
    startSessionKeepAlive();
    const onExpired = () => setOpen(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-[400px] [&>button.absolute]:hidden"
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-highlight-ink" />
            Sesja wygasła
          </DialogTitle>
          <DialogDescription>
            {pending > 0
              ? `Twoje zmiany (${pending} ${pending === 1 ? 'dzień' : 'dni'}) są bezpieczne w tej przeglądarce i zapiszą się zaraz po zalogowaniu.`
              : 'Zaloguj się ponownie — otwarte formularze i szkice zostają na miejscu.'}
          </DialogDescription>
        </DialogHeader>
        <LoginForm
          variant="inline"
          onLogin={() => {
            setOpen(false);
            markSessionRestored();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
