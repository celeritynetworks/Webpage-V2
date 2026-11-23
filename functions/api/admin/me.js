export async function onRequestGet(context) {
  const admin = context.data?.admin;

  if (!admin?.email) {
    return new Response(
      JSON.stringify({
        success: false,
        message: "Administrator authentication required."
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      admin: {
        email: admin.email
      }
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    }
  );
}