import React from 'react';
import { useConfirmStore } from '../../store/confirmStore';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog';

export const GlobalConfirmDialog: React.FC = () => {
  const {
    isOpen,
    title,
    description,
    confirmText,
    cancelText,
    variant,
    resolve,
    close,
  } = useConfirmStore();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (resolve) resolve(false);
      close();
    }
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    if (resolve) resolve(true);
    close();
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault();
    if (resolve) resolve(false);
    close();
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            {cancelText}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className={variant === 'destructive' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
