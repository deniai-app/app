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

type ChangeEmailConfirmationEmailProps = {
  name?: string | null;
  currentEmail: string;
  newEmail: string;
  confirmUrl: string;
  securityUrl?: string;
};

export const changeEmailConfirmationEmailSubject = "Confirm your email change - Deni AI";

/**
 * Sent to the account's current address before an email change. The new
 * address only receives its verification link after this one is confirmed.
 */
export function ChangeEmailConfirmationEmail({
  name,
  currentEmail,
  newEmail,
  confirmUrl,
  securityUrl,
}: ChangeEmailConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Confirm the request to change your Deni AI email address.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Confirm your email change</Heading>
          <Text style={text}>Hi{name ? ` ${name}` : ""},</Text>
          <Text style={text}>
            We received a request to change the email address of your Deni AI account from{" "}
            <strong>{currentEmail}</strong> to:
          </Text>
          <Text style={highlight}>{newEmail}</Text>
          <Text style={text}>
            If this was you, click the button below to approve the change. We&apos;ll then send a
            verification link to the new address, and your email will only be updated once that link
            is opened.
          </Text>
          <Section style={buttonSection}>
            <Button href={confirmUrl} style={button}>
              Confirm Email Change
            </Button>
          </Section>
          <Text style={text}>If the button does not work, open this link directly:</Text>
          <Link href={confirmUrl} style={link}>
            {confirmUrl}
          </Link>
          <Text style={footer}>This link will expire in 1 hour.</Text>
          <Text style={warning}>
            If you didn&apos;t request this change, don&apos;t click the link. Your email address
            will stay the same. Someone else may have access to your account, so we recommend
            changing your password and signing out of other sessions
            {securityUrl ? (
              <>
                {" "}
                in your{" "}
                <Link href={securityUrl} style={inlineLink}>
                  security settings
                </Link>
              </>
            ) : null}
            .
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

const inlineLink = {
  color: "#2563eb",
};

const warning = {
  color: "#374151",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 16px",
};

const footer = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};
