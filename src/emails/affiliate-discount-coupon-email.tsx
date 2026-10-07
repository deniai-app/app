import { Body, Container, Head, Heading, Html, Preview, Text } from "react-email";

type AffiliateDiscountCouponEmailProps = {
  name?: string | null;
  couponCode: string;
  discountPercent: number;
  note?: string | null;
};

export function AffiliateDiscountCouponEmail({
  name,
  couponCode,
  discountPercent,
  note,
}: AffiliateDiscountCouponEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your Deni AI discount coupon is ready.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={heading}>Your {discountPercent}% off coupon</Heading>
          <Text style={text}>Hi{name ? ` ${name}` : ""},</Text>
          <Text style={text}>
            Thank you for bringing new members to Deni AI. Here is your {discountPercent}% off
            coupon for a Deni AI paid plan:
          </Text>
          <Text style={coupon}>{couponCode}</Text>
          {note ? <Text style={text}>{note}</Text> : null}
          <Text style={footer}>
            Apply this code during checkout. If you have any questions, reply to this email.
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

const coupon = {
  backgroundColor: "#f3f4f6",
  border: "1px dashed #9ca3af",
  borderRadius: "10px",
  color: "#111827",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  fontSize: "20px",
  fontWeight: "700",
  letterSpacing: "0.08em",
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
