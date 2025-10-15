import { Button, Container, Heading, Hr, Text } from '@react-email/components';

import { Layout } from './shared/Layout';

type Props = {
  householdName: string;
  inviteeEmailAddress: string;
  url: string;
};

export function JoinHousehold({ householdName, inviteeEmailAddress, url }: Props) {
  return (
    <Layout title={`Join "${householdName}" household`}>
      <Container>
        <Heading as="h2" className="text-xs font-normal leading-none text-zinc-500">
          {`Join "${householdName}" household`}
        </Heading>
        <Heading className="mt-3 leading-none">Howdy {inviteeEmailAddress} 👋</Heading>
        <Text>You have been invited to join the {householdName} household!</Text>
        <Hr />
        <Text>To join the household, click on the link below:</Text>
        <Button className="w-full rounded-md bg-zinc-800 py-4 text-center font-medium leading-4 text-white" href={url}>
          Join household
        </Button>
      </Container>
    </Layout>
  );
}

JoinHousehold.PreviewProps = {
  inviteeEmailAddress: 'john@test.com',
  householdName: "Doe's Home",
  url: '#',
};
