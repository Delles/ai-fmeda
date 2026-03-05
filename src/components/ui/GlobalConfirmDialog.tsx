import React from 'react';
import { useConfirmStore } from '../../store/confirmStore';
import { AlertCircle, AlertTriangle, Info, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
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
    type,
    icon,
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
          <div className="flex items-center gap-3">
            {icon === 'error' && (
              <div className="p-2 rounded-full bg-red-50 border border-red-100">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
            )}
            {icon === 'warning' && (
              <div className="p-2 rounded-full bg-amber-50 border border-amber-100">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
            )}
            {icon === 'info' && (
              <div className="p-2 rounded-full bg-blue-50 border border-blue-100">
                <Info className="w-5 h-5 text-blue-600" />
              </div>
            )}
            {icon === 'sparkles' && (
              <div className="p-2 rounded-full bg-indigo-50 border border-indigo-100">
                <Sparkles className="w-5 h-5 text-indigo-600" />
              </div>
            )}
            <AlertDialogTitle className={cn(
              icon && "text-lg"
            )}>{title}</AlertDialogTitle>
          </div>
          {description && (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {type === 'confirm' && (
            <AlertDialogCancel onClick={handleCancel}>
              {cancelText}
            </AlertDialogCancel>
          )}
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
