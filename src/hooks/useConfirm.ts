import { useConfirmStore } from '../store/confirmStore';

export const useConfirm = () => {
  const confirm = useConfirmStore((state) => state.confirm);
  return confirm;
};
