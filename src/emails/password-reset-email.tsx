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

type PasswordResetEmailProps = {
  name?: string | null;
  resetUrl: string;
};

export const passwordResetEmailSubject = "Reset your password - Deni AI";

export function PasswordResetEmail({ name, resetUrl }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Deni AI password. This link expires in 1 hour.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Reset your password</Heading>
          <Text style={text}>Hi{name ? ` ${name}` : ""},</Text>
          <Text style={text}>
            We received a request to reset your password. Click the button below to create a new
            password.
          </Text>
          <Section style={buttonSection}>
            <Button href={resetUrl} style={button}>
              Reset Password
            </Button>
          </Section>
          <Text style={text}>If the button does not work, open this link directly:</Text>
          <Link href={resetUrl} style={link}>
            {resetUrl}
          </Link>
          <Text style={footer}>This link will expire in 1 hour.</Text>
          <Text style={footer}>
            If you didn&apos;t request a password reset, you can safely ignore this email.
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
