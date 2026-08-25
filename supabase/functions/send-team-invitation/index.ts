import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { email, token, fullName, role, invitedByEmail } = await req.json();

    // Get required environment variables
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the app URL from environment or use default
    const appUrl = Deno.env.get("APP_URL") || "http://localhost:8081";
    const inviteLink = `${appUrl}/invite/${token}`;

    // Prepare email content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 20px;">
        <div style="background: #1e293b; border-radius: 8px; padding: 30px;">
          <h2 style="color: #10b981; margin-top: 0;">You're Invited to Join Our Team</h2>
          
          <p>Hi ${fullName || "there"},</p>
          
          <p><strong>${invitedByEmail}</strong> has invited you to join the team as a <strong style="color: #10b981;">${role.replace(/_/g, " ")}</strong>.</p>
          
          <div style="background: #0f172a; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <p style="margin: 0 0 15px 0; color: #cbd5e1;">
              Click the button below to accept your invitation:
            </p>
            <a href="${inviteLink}" style="display: inline-block; background: #10b981; color: #0f172a; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Accept Invitation
            </a>
          </div>
          
          <p style="color: #94a3b8; font-size: 14px; margin: 20px 0 0 0;">
            Or copy and paste this link in your browser:<br>
            <code style="background: #0f172a; padding: 4px 8px; border-radius: 4px; color: #10b981;">${inviteLink}</code>
          </p>
          
          <p style="color: #64748b; font-size: 12px; margin-top: 20px; border-top: 1px solid #334155; padding-top: 15px;">
            This invitation will expire in 7 days.
          </p>
        </div>
      </div>
    `;

    // Send email using Resend API
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "EcomOS <onboarding@resend.dev>",
        to: email,
        subject: `You're Invited to Join ${invitedByEmail}'s Team`,
        html: htmlContent,
      }),
    });

    const resendData = await resendResponse.json();

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendResponse.status, resendData);
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: resendData.message || "Resend API error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully via Resend:", resendData.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation email sent",
        emailId: resendData.id,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
