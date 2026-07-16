import { Button, Container, Heading, Hr, Text } from 'react-email';

import { Layout } from './shared/Layout';

type Props = {
  userName: string;
  url: string;
};

export function VerifyEmail({ userName, url }: Props) {
  return (
    <Layout title="Verify your email">
      <Container>
        <Heading as="h2" className="font-normal text-xs text-zinc-500 leading-none">
          Verify your email address
        </Heading>
        <Heading className="mt-3 leading-none">Howdy {userName} 👋</Heading>
        <Text>
          Welcome aboard! You're just on click away from making sure your household life is neat and organised ✨
        </Text>
        <Hr />
        <Text>Before you can continue using the application, please verify your email by using the link below:</Text>
        <Button className="w-full rounded-md bg-zinc-800 py-4 text-center font-medium text-white leading-4" href={url}>
          Verify your email
        </Button>
      </Container>
    </Layout>
  );
}

VerifyEmail.PreviewProps = {
  userName: 'John',
};
