"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { DeviceModelCreateForm } from "@/components/admin/device-model-form";

type OpenFn = () => void;

const NewDeviceModelModalContext = createContext<OpenFn | null>(null);

export function useOpenNewDeviceModelModal(): OpenFn {
  const open = useContext(NewDeviceModelModalContext);
  if (!open) {
    throw new Error("useOpenNewDeviceModelModal must be used within NewDeviceModelModalProvider");
  }
  return open;
}

export function NewDeviceModelModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const close = useCallback(() => setOpen(false), []);
  const openModal = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const onDialogClose = () => setOpen(false);
    el.addEventListener("close", onDialogClose);
    return () => el.removeEventListener("close", onDialogClose);
  }, []);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  return (
    <NewDeviceModelModalContext.Provider value={openModal}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="new-device-model-title"
        className="w-[min(100%,28rem)] max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 [&::backdrop]:bg-black/50"
      >
        <div className="border-b border-zinc-100 px-6 py-4 dark:border-zinc-800">
          <h2 id="new-device-model-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            New device model
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Add a product to the catalog. Active models appear on Register device.
          </p>
        </div>
        <div className="max-h-[min(70vh,520px)] overflow-y-auto px-6 py-4">
          <DeviceModelCreateForm onRequestClose={close} embedded="modal" />
        </div>
      </dialog>
    </NewDeviceModelModalContext.Provider>
  );
}

export function NewModelButton({ className }: { className?: string }) {
  const open = useOpenNewDeviceModelModal();
  return (
    <button type="button" onClick={open} className={className}>
      <span className="text-lg leading-none">+</span>
      New model
    </button>
  );
}
