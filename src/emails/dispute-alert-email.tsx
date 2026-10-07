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

export type DisputeAlertKind = "dispute_created" | "dispute_closed" | "early_fraud_warning";

export type DisputeAlertEmailProps = {
  kind: DisputeAlertKind;
  title: string;
  preview: string;
  amount: string;
  reason: string;
  status: string;
  customerEmail?: string | null;
  userId?: string | null;
  stripeId: string;
  dashboardUrl: string;
  notes: string[];
};

export function disputeAlertEmailSubject(kind: DisputeAlertKind, amount: string) {
  switch (kind) {
    case "early_fraud_warning":
      return `Stripe early fraud warning (${amount})`;
    case "dispute_closed":
      return `Stripe dispute closed (${amount})`;
    default:
      return `Stripe dispute received (${amount})`;
  }
}

export function DisputeAlertEmail({
  title,
  preview,
  amount,
  reason,
  status,
  customerEmail,
  userId,
  stripeId,
  dashboardUrl,
  notes,
}: DisputeAlertEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>{title}</Heading>
          <Text style={text}>
            Amount: {amount}
            <br />
            Reason: {reason}
            <br />
            Status: {status}
            <br />
            Stripe ID: {stripeId}
            {customerEmail ? (
              <>
                <br />
                Customer: {customerEmail}
              </>
            ) : null}
            {userId ? (
              <>
                <br />
                User ID: {userId}
              </>
            ) : null}
          </Text>
          {notes.length > 0 ? (
            <Section>
              {notes.map((note) => (
                <Text key={note} style={text}>
                  {note}
                </Text>
              ))}
            </Section>
          ) : null}
          <Section style={buttonSection}>
            <Button href={dashboardUrl} style={button}>
              Open in Stripe
            </Button>
          </Section>
          <Text style={footer}>
            Dashboard:{" "}
            <Link href={dashboardUrl} style={link}>
              {dashboardUrl}
            </Link>
          </Text>
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
  fontSize: "24px",
  fontWeight: "700",
  lineHeight: "32px",
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
  overflowWrap: "anywhere" as const,
};

const footer = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};
