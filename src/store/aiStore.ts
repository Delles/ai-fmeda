import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AIConfig } from '../types/ai';

interface AIState {
  config: AIConfig;
  setConfig: (config: Partial<AIConfig>) => void;
}

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      config: {
        apiKey: '',
        provider: 'openai',
        model: 'gpt-4o-mini',
      },
      setConfig: (updates) =>
        set((state) => ({
          config: { ...state.config, ...updates },
        })),
    }),
    {
      name: 'fmeda-ai-config',
    }
  )
);
