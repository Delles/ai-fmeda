import { create } from "zustand";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  type?: "confirm" | "alert";
  icon?: "info" | "warning" | "error" | "sparkles";
}

interface ConfirmState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  variant: "default" | "destructive";
  type: "confirm" | "alert";
  icon?: "info" | "warning" | "error" | "sparkles";
  resolve: ((value: boolean) => void) | null;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  close: () => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  title: "",
  description: "",
  confirmText: "Confirm",
  cancelText: "Cancel",
  variant: "default",
  type: "confirm",
  resolve: null,
  confirm: (options) => {
    const currentResolve = get().resolve;
    if (currentResolve) {
      currentResolve(false);
    }

    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        title: options.title,
        description: options.description || "",
        confirmText: options.confirmText || (options.type === 'alert' ? 'OK' : 'Confirm'),
        cancelText: options.cancelText || "Cancel",
        variant: options.variant || "default",
        type: options.type || "confirm",
        icon: options.icon,
        resolve,
      });
    });
  },
  close: () => {
    const currentResolve = get().resolve;
    if (currentResolve) currentResolve(false);
    set({ isOpen: false, resolve: null });
  },
}));
