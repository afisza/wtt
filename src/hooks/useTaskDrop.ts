import { useState } from 'react';

export const TASK_DRAG_TYPE = 'application/x-wtt-task';

export interface DraggedTask {
  from: string;
  taskId: string;
}

export function setTaskDragData(e: React.DragEvent, data: DraggedTask) {
  e.dataTransfer.setData(TASK_DRAG_TYPE, JSON.stringify(data));
  e.dataTransfer.effectAllowed = 'move';
}

/** Strefa upuszczania zadania (dzień, kolumna statusu itp.). */
export function useTaskDrop(onDrop: (task: DraggedTask) => void) {
  const [isOver, setIsOver] = useState(false);
  const handlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(TASK_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (!isOver) setIsOver(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsOver(false);
    },
    onDrop: (e: React.DragEvent) => {
      setIsOver(false);
      const raw = e.dataTransfer.getData(TASK_DRAG_TYPE);
      if (!raw) return;
      e.preventDefault();
      try {
        const data = JSON.parse(raw) as DraggedTask;
        if (data?.from && data?.taskId) onDrop(data);
      } catch {
        /* ignore */
      }
    },
  };
  return { isOver, handlers };
}
