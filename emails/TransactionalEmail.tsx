import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "react-email";

interface TransactionalEmailProps {
  readonly preview: string;
  readonly heading: string;
  readonly body: string;
  readonly statusLabel: string;
}

export function TransactionalEmail({
  preview,
  heading,
  body,
  statusLabel,
}: TransactionalEmailProps) {
  return (
    <Html lang="zh-Hant-TW">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#f1eee6", color: "#1c1e1b", fontFamily: "serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "40px 24px" }}>
          <Text style={{ letterSpacing: "0.18em", color: "#602f34" }}>LIGNÉE</Text>
          <Heading style={{ fontWeight: 400 }}>{heading}</Heading>
          <Section style={{ borderTop: "1px solid #c9c3b5", paddingTop: "24px" }}>
            <Text>{body}</Text>
            <Text>狀態：{statusLabel}</Text>
          </Section>
          <Text style={{ color: "#686a63", fontSize: "12px" }}>
            Made to Be Inherited. · 此交易信不含完整地址、電話或長效安全連結。
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
