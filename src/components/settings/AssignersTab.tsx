import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import SettingsSection from './SettingsSection';
import EntityManager, { type Entity, type EntityDraft } from './EntityManager';

interface AssignerRow {
  id: string;
  name: string;
  avatar?: string;
}

async function errorText(res: Response, fallback: string) {
  const data = await res.json().catch(() => ({}));
  return data.error || data.details || fallback;
}

export default function AssignersTab() {
  const { showToast } = useToast();
  const [assigners, setAssigners] = useState<AssignerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiFetch('/api/assigners');
      if (res.ok) setAssigners(await res.json());
    } catch {
      showToast('Nie udało się wczytać osób zlecających', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const notify = () => window.dispatchEvent(new Event('assignerUpdated'));

  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await apiFetch('/api/assigners/upload', { method: 'POST', body: fd });
      if (res.ok) return (await res.json()).avatar as string;
      showToast(await errorText(res, 'Nie udało się wgrać zdjęcia'), 'error');
    } catch {
      showToast('Nie udało się wgrać zdjęcia', 'error');
    }
    return null;
  };

  const save = async (method: 'POST' | 'PUT', d: EntityDraft, id?: Entity['id']) => {
    try {
      const res = await apiFetch('/api/assigners', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: d.name, avatar: d.image || undefined }),
      });
      if (!res.ok) {
        showToast(await errorText(res, 'Nie udało się zapisać'), 'error');
        return false;
      }
      await load();
      notify();
      showToast(method === 'POST' ? `Dodano: ${d.name}` : 'Zapisano zmiany', 'success');
      return true;
    } catch {
      showToast('Nie udało się zapisać', 'error');
      return false;
    }
  };

  const remove = async (id: Entity['id']) => {
    try {
      const res = await apiFetch(`/api/assigners?id=${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await errorText(res, 'Nie udało się usunąć'));
      await load();
      notify();
      showToast('Usunięto', 'success');
    } catch (e) {
      showToast((e as Error).message, 'error');
    }
  };

  return (
    <SettingsSection
      title="Osoby zlecające"
      description="Osoby, które zlecają zadania. Przypiszesz je do zadania w formularzu, a ich zdjęcia pojawią się przy wpisach."
    >
      <EntityManager
        items={assigners.map((a) => ({ id: a.id, name: a.name, image: a.avatar }))}
        loading={loading}
        shape="round"
        nameLabel="Imię i nazwisko"
        namePlaceholder="np. Anna Kowalska"
        addLabel="Dodaj osobę"
        emptyText="Brak osób zlecających. Dodaj pierwszą powyżej."
        deleteTitle={(n) => `Usunąć „${n}”?`}
        deleteDescription="Osoba zniknie z listy wyboru. Istniejące zadania zachowają jej imię."
        onUpload={upload}
        onCreate={(d) => save('POST', d)}
        onUpdate={(id, d) => save('PUT', d, id)}
        onDelete={remove}
      />
    </SettingsSection>
  );
}
