import { type PropsWithChildren } from 'react';

export function Code({ children, className }: PropsWithChildren<{ className?: string }>) {
  return <code className={className}>{children}</code>;
}
