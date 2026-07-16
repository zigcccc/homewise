import { type PropsWithChildren } from 'react';
import { Body, Head, Html, pixelBasedPreset, Tailwind } from 'react-email';

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
