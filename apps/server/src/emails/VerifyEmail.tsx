import { Button, Container, Heading, Hr, Text } from '@react-email/components';

import { Layout } from './shared/Layout';

type Props = {
  userName: string;
  url: string;
};

export function VerifyEmail({ userName, url }: Props) {
  return (
    <Layout title="Verify your email">
      <Container>
        <Heading as="h2" className="text-xs leading-none font-normal text-zinc-500">
          Verify your email address
        </Heading>
        <Heading className="mt-3 leading-none">Howdy {userName} 👋</Heading>
        <Text>
          Welcome aboard! You're just on click away from making sure your household life is neat and organised ✨
        </Text>
        <Hr />
        <Text>Before you can continue using the application, please verify your email by using the link below:</Text>
        <Button className="w-full rounded-md bg-zinc-800 py-4 text-center leading-4 font-medium text-white" href={url}>
          Verify your email
        </Button>
      </Container>
    </Layout>
  );
}

VerifyEmail.PreviewProps = {
  userName: 'John',
};
