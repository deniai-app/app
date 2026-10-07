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

type NewEmailVerificationEmailProps = {
  name?: string | null;
  newEmail: string;
  verificationUrl: string;
};

export const newEmailVerificationEmailSubject = "Verify your new email address - Deni AI";

/**
 * Sent to the requested address during an email change. Opening the link is
 * what actually moves the account to this address.
 */
export function NewEmailVerificationEmail({
  name,
  newEmail,
  verificationUrl,
}: NewEmailVerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify this address to finish changing your Deni AI email.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Verify your new email address</Heading>
          <Text style={text}>Hi{name ? ` ${name}` : ""},</Text>
          <Text style={text}>
            A request was made to change the email address of a Deni AI account to:
          </Text>
          <Text style={highlight}>{newEmail}</Text>
          <Text style={text}>
            Click the button below to verify this address. The account email is updated as soon as
            the link is opened, and you&apos;ll use this address to sign in from then on.
          </Text>
          <Section style={buttonSection}>
            <Button href={verificationUrl} style={button}>
              Verify New Email
            </Button>
          </Section>
          <Text style={text}>If the button does not work, open this link directly:</Text>
          <Link href={verificationUrl} style={link}>
            {verificationUrl}
          </Link>
          <Text style={footer}>This link will expire in 1 hour.</Text>
          <Text style={footer}>
            If you didn&apos;t request this change, you can safely ignore this email. Nothing will
            change unless the link is opened.
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

const highlight = {
  backgroundColor: "#f3f4f6",
  borderRadius: "10px",
  color: "#111827",
  fontSize: "16px",
  fontWeight: "600",
  lineHeight: "24px",
  margin: "0 0 16px",
  overflowWrap: "anywhere" as const,
  padding: "12px 16px",
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
