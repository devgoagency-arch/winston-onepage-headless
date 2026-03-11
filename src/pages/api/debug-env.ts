export const GET = async () => {
  const CK = (import.meta.env.WC_CONSUMER_KEY || "").trim();
  const CS = (import.meta.env.WC_CONSUMER_SECRET || "").trim();
  const WC_URL = (import.meta.env.WC_URL || "").trim();
  const WP_URL = (import.meta.env.WP_URL || "").trim();

  return new Response(JSON.stringify({
    WC_URL,
    WP_URL,
    CK_LENGTH: CK.length,
    CS_LENGTH: CS.length,
    CK_START: CK.substring(0, 6),
    CS_START: CS.substring(0, 6)
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
