import { useMemo, useState } from "react";

const DEFAULT_CONFIRM_DIALOG = {
  title: "Czy na pewno?",
  message: "",
  variant: "default",
  confirmLabel: undefined,
  cancelLabel: undefined,
  busy: false,
};

export function useConfirmDialog() {
  const [confirmDialog, setConfirmDialog] = useState(null);

  function openConfirmDialog(config) {
    setConfirmDialog({
      ...DEFAULT_CONFIRM_DIALOG,
      ...config,
    });
  }

  function closeConfirmDialog() {
    setConfirmDialog((prev) => (prev?.busy ? prev : null));
  }

  function clearConfirmDialog() {
    setConfirmDialog(null);
  }

  function setConfirmBusy(nextBusy) {
    setConfirmDialog((prev) => (prev ? { ...prev, busy: Boolean(nextBusy) } : prev));
  }

  async function runConfirmAction(action) {
    setConfirmBusy(true);
    try {
      const success = await action();
      if (success) {
        clearConfirmDialog();
      } else {
        setConfirmBusy(false);
      }
      return success;
    } catch (error) {
      setConfirmBusy(false);
      throw error;
    }
  }

  const confirmModalProps = useMemo(() => ({
    open: Boolean(confirmDialog),
    onClose: closeConfirmDialog,
    onConfirm: async () => {
      if (!confirmDialog?.onConfirm) {
        clearConfirmDialog();
        return true;
      }
      const result = await confirmDialog.onConfirm();
      if (result !== false) {
        clearConfirmDialog();
        return true;
      }
      return false;
    },
    title: confirmDialog?.title,
    message: confirmDialog?.message,
    confirmLabel: confirmDialog?.confirmLabel,
    cancelLabel: confirmDialog?.cancelLabel,
    variant: confirmDialog?.variant,
    busy: Boolean(confirmDialog?.busy),
  }), [confirmDialog]);

  return {
    confirmDialog,
    confirmModalProps,
    openConfirmDialog,
    closeConfirmDialog,
    clearConfirmDialog,
    setConfirmBusy,
    runConfirmAction,
  };
}
