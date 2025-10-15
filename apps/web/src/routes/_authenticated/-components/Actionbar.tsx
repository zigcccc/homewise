import { SidebarTrigger } from '@homewise/ui/core/sidebar';
import { createContext, type PropsWithChildren, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

const ActionbarContext = createContext<{
  actionbarRef: HTMLElement | null;
  setActionbarRef: (ref: HTMLElement | null) => void;
} | null>(null);

function useActionbar() {
  const context = useContext(ActionbarContext);

  if (!context) {
    throw new Error('Actionbar.Root and Actionbar.Content must be wrapper in Actionbar.Provider component.');
  }

  return context;
}

function ActionbarProvider({ children }: PropsWithChildren) {
  const [actionbarRef, setActionbarRef] = useState<HTMLElement | null>(null);

  return <ActionbarContext.Provider value={{ actionbarRef, setActionbarRef }}>{children}</ActionbarContext.Provider>;
}

function ActionbarRoot() {
  const { setActionbarRef } = useActionbar();

  return (
    <nav
      ref={setActionbarRef}
      className="sticky top-0 left-1 z-10 flex h-[70px] items-center gap-2 rounded-t-xl border-b border-b-zinc-200 bg-white p-3"
    >
      <SidebarTrigger />
    </nav>
  );
}

function ActionbarContent({ className, children }: PropsWithChildren<{ className?: string }>) {
  const { actionbarRef } = useActionbar();

  if (!actionbarRef) {
    return null;
  }

  return createPortal(<div className={className}>{children}</div>, actionbarRef);
}

export const Actionbar = {
  Provider: ActionbarProvider,
  Root: ActionbarRoot,
  Content: ActionbarContent,
} as const;
