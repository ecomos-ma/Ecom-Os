import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("send-team-invitation called, method:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    console.error("Method not allowed:", req.method);
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("Request body received:", JSON.stringify(body));
    
    const { token, email, fullName, role, invitedByEmail } = body;

    // Validate required fields
    if (!token) {
      console.error("Missing token field");
      return new Response(
        JSON.stringify({ error: "Missing token field", received: Object.keys(body) }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!email) {
      console.error("Missing email field. Body keys:", Object.keys(body));
      return new Response(
        JSON.stringify({ 
          error: "Missing email field",
          received: Object.keys(body),
          debug: "Frontend should send: { token, email, fullName, role, invitedByEmail }"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get required environment variables for email
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    console.log("RESEND_API_KEY configured:", !!resendApiKey);
    
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Email service not configured - RESEND_API_KEY missing"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the app URL from environment or use default
    const appUrl = (Deno.env.get("APP_URL") || "https://www.ecomos.ma").trim().replace(/\/+$/, "");
    const inviteLink = `${appUrl}/invite?token=${token}`;
    console.log("Generated invite link:", inviteLink);

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

    console.log("Sending email to:", email);
    
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
    console.log("Resend response status:", resendResponse.status, "data:", resendData);

    if (!resendResponse.ok) {
      console.error("Resend API error:", resendResponse.status, resendData);
      return new Response(
        JSON.stringify({
          error: "Failed to send email",
          details: resendData.message || "Resend API error",
          status: resendResponse.status,
          resendData: resendData
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email sent successfully via Resend:", resendData.id);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Invitation email sent",
        emailId: resendData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in send-team-invitation:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
