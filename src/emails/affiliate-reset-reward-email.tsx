import { Body, Container, Head, Heading, Html, Preview, Text } from "react-email";
import type { AffiliateResetRewardEmailStatus } from "@/emails/affiliate-reset-reward-email-subject";

type AffiliateResetRewardEmailProps = {
  name?: string | null;
  quantity: number;
  status: AffiliateResetRewardEmailStatus;
};

export function AffiliateResetRewardEmail({
  name,
  quantity,
  status,
}: AffiliateResetRewardEmailProps) {
  const isApproved = status === "approved";
  const creditLabel = `rate-limit reset ${quantity === 1 ? "credit" : "credits"}`;

  return (
    <Html>
      <Head />
      <Preview>
        {isApproved
          ? "Your Deni AI referral reward was approved."
          : "Your Deni AI referral reward was not approved."}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>
            {isApproved
              ? "Your referral reward was approved"
              : "Your referral reward was not approved"}
          </Heading>
          <Text style={text}>Hi{name ? ` ${name}` : ""},</Text>
          {isApproved ? (
            <>
              <Text style={text}>
                Good news — your referral reward has been approved by the Deni AI team.
              </Text>
              <Text style={reward}>
                +{quantity} {creditLabel}
              </Text>
              <Text style={text}>
                The reward has been added to your account and can be used to reset your rate limits.
              </Text>
            </>
          ) : (
            <Text style={text}>
              We reviewed your referral reward, but it was not approved. No reset credit was added
              to your account.
            </Text>
          )}
          <Text style={footer}>If you have any questions, reply to this email.</Text>
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

const reward = {
  backgroundColor: "#ecfdf5",
  border: "1px solid #a7f3d0",
  borderRadius: "10px",
  color: "#065f46",
  fontSize: "20px",
  fontWeight: "700",
  margin: "24px 0",
  padding: "16px",
  textAlign: "center" as const,
};

const footer = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 8px",
};
