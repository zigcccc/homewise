import { Body, Head, Html } from '@react-email/components';
import { pixelBasedPreset, Tailwind } from '@react-email/tailwind';
import { type PropsWithChildren } from 'react';

export function Layout({ children, title }: PropsWithChildren<{ title: string }>) {
  return (
    <Tailwind
      config={{
        presets: [pixelBasedPreset],
      }}
    >
      <Html>
        <Head>
          <title>{title}</title>
        </Head>
        <Body className="font-sans">{children}</Body>
      </Html>
    </Tailwind>
  );
}
