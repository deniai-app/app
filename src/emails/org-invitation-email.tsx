import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "react-email";

import { sanitizeSubjectValue } from "@/emails/org-invitation-email-subject";

type OrgInvitationEmailProps = {
  orgName: string;
  inviterName?: string | null;
  acceptUrl: string;
};

export function OrgInvitationEmail({ orgName, inviterName, acceptUrl }: OrgInvitationEmailProps) {
  const displayOrg = sanitizeSubjectValue(orgName, "your organization");
  const inviter = inviterName?.trim() || "Someone";

  return (
    <Html>
      <Head />
      <Preview>
        {inviter} invited you to join {displayOrg} on Deni AI.
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>You&apos;re invited!</Heading>
          <Text style={text}>
            {inviter} has invited you to join <strong>{displayOrg}</strong> on Deni AI.
          </Text>
          <Text style={text}>Click the button below to accept the invitation.</Text>
          <Section style={buttonSection}>
            <Button href={acceptUrl} style={button}>
              Accept Invitation
            </Button>
          </Section>
          <Text style={text}>If the button does not work, open this link directly:</Text>
          <Link href={acceptUrl} style={link}>
            {acceptUrl}
          </Link>
          <Text style={footer}>
            If you weren&apos;t expecting this invitation, you can safely ignore this email.
          </Text>
          <Text style={footer}>Best,</Text>
          <Text style={footer}>Deni AI Team</Text>
        </Container>
      </Body>
    </Html>
  );
}

const main = {
  backgroundColor: "#f5f5f5",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  margin: 0,
  padding: "32px 16px",
};

const container = {
  backgroundColor: "#ffffff",
  border: "1px solid #e5e5e5",
  borderRadius: "16px",
  margin: "0 auto",
  maxWidth: "560px",
  padding: "32px",
};

const heading = {
  color: "#111827",
  fontSize: "28px",
  fontWeight: "700",
  lineHeight: "36px",
  margin: "0 0 20px",
};

const text = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "26px",
  margin: "0 0 16px",
};

const buttonSection = {
  margin: "28px 0",
};

const button = {
  backgroundColor: "#111827",
  borderRadius: "10px",
  color: "#ffffff",
  display: "inline-block",
  fontSize: "16px",
  fontWeight: "600",
  padding: "14px 24px",
  textDecoration: "none",
};

const link = {
  color: "#2563eb",
  display: "block",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 20px",
  overflowWrap: "anywhere" as const,
};

const footer = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};
