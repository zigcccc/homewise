import { type PropsWithChildren } from 'react';

type Props = PropsWithChildren<{
  className?: string;
  appName: string;
}>;

export const Button = ({ children, className, appName }: Props) => {
  return (
    <button className={className} onClick={() => alert(`Hello from your ${appName} app!`)}>
      {children}
    </button>
  );
};
