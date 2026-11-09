import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import SettingsSection from './SettingsSection';
import EntityManager, { type Entity, type EntityDraft } from './EntityManager';

interface Client {
  id: number;
  name: string;
  logo?: string;
  website?: string;
}

async function errorText(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return data.details || data.error || fallback;
}

export default function ClientsTab() {
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/clients');
      if (res.ok) setClients(await res.json());
    } catch {
      showToast('Nie udało się wczytać klientów', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const notify = () => window.dispatchEvent(new Event('clientUpdated'));

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiFetch('/api/clients/upload', { method: 'POST', body: fd });
      if (res.ok) return (await res.json()).url as string;
      showToast(await errorText(res, 'Nie udało się wgrać logo'), 'error');
    } catch {
      showToast('Nie udało się wgrać logo', 'error');
    }
    return null;
  };

  const save = async (method: 'POST' | 'PUT', d: EntityDraft, id?: Entity['id']) => {
    try {
      const res = await apiFetch('/api/clients', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: d.name, logo: d.image, website: d.extra }),
      });
      if (!res.ok) {
        showToast(await errorText(res, 'Nie udało się zapisać klienta'), 'error');
        return false;
      }
      await load();
      notify();
      showToast(method === 'POST' ? `Dodano klienta ${d.name}` : 'Zapisano zmiany', 'success');
      return true;
    } catch {
      showToast('Nie udało się zapisać klienta', 'error');
      return false;
    }
  };

  const remove = async (id: Entity['id']) => {
    try {
      const res = await apiFetch(`/api/clients?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await errorText(res, 'Nie udało się usunąć klienta'));
      await load();
      notify();
      showToast('Klient usunięty', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  return (
    <SettingsSection
      title="Klienci"
      description="Każdy klient ma własny kalendarz godzin i własny raport PDF."
    >
      <EntityManager
        items={clients.map((c) => ({ id: c.id, name: c.name, image: c.logo, extra: c.website }))}
        loading={loading}
        shape="square"
        nameLabel="Nazwa klienta"
        namePlaceholder="np. Best Market"
        extraLabel="Strona www (opcjonalnie)"
        extraPlaceholder="https://"
        addLabel="Dodaj klienta"
        emptyText="Nie masz jeszcze klientów. Dodaj pierwszego powyżej."
        deleteTitle={(n) => `Usunąć klienta „${n}”?`}
        deleteDescription="Razem z klientem zostaną trwale usunięte wszystkie jego dni pracy i zadania. Tej operacji nie można cofnąć."
        onUpload={upload}
        onCreate={(d) => save('POST', d)}
        onUpdate={(id, d) => save('PUT', d, id)}
        onDelete={remove}
      />
    </SettingsSection>
  );
}
