import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0"
import { isServiceRoleRequest, unauthorized } from "../_shared/webhookAuth.ts"
import { DEFAULT_EMAIL_FROM, escapeHtml } from "../_shared/html.ts"

const EMAIL_FROM = Deno.env.get('EMAIL_FROM') || DEFAULT_EMAIL_FROM

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS Preflight Requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Only the tasks / project_members database webhooks may trigger emails
  if (!isServiceRoleRequest(req)) {
    return unauthorized()
  }

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ""
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ""

    if (!RESEND_API_KEY) {
      console.warn("RESEND_API_KEY is not configured in secrets.")
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Parse the payload sent by the database webhook
    const payload = await req.json()
    const { table, record, old_record, type } = payload

    let email = ""
    let recipientName = ""
    let subject = ""
    let htmlContent = ""

    // --- SCENARIO 1: A task has been newly assigned or reassigned ---
    if (table === 'tasks') {
      const isNewAssignment = type === 'INSERT' && record?.assignee_id
      const isUpdatedAssignment = type === 'UPDATE' && record?.assignee_id && record.assignee_id !== old_record?.assignee_id

      if (isNewAssignment || isUpdatedAssignment) {
        // Fetch assignee details (email & name) from users table
        const { data: user, error: userError } = await supabaseAdmin
          .from('users')
          .select('email, name')
          .eq('id', record.assignee_id)
          .single()

        if (userError) {
          console.error("Error fetching user for task assignment:", userError)
        }

        if (user?.email) {
          email = user.email
          recipientName = user.name || "Spacer Team Member"
          subject = `🚀 New Task Assigned: ${record.title || 'Untitled Task'}`
          htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
              <h2 style="color: #1a202c; margin-top: 0;">Hello ${escapeHtml(recipientName)},</h2>
              <p style="font-size: 16px; color: #4a5568; line-height: 1.5;">
                You have been assigned a new task: <strong style="color: #2b6cb0;">${escapeHtml(record.title || 'Untitled Task')}</strong>.
              </p>
              ${record.description ? `<div style="background-color: #f7fafc; padding: 16px; border-left: 4px solid #3182ce; border-radius: 4px; font-style: italic; color: #4a5568; margin: 20px 0;">"${escapeHtml(record.description)}"</div>` : ''}
              <p style="font-size: 14px; color: #718096; margin-top: 24px;">
                Please log in to your Spacer dashboard to view details and track task progress.
              </p>
            </div>
          `
        }
      }
    }

    // --- SCENARIO 2: A member has been added to a project space ---
    if (table === 'project_members' && type === 'INSERT') {
      if (record?.user_id && record?.project_id) {
        // Fetch user details
        const { data: user, error: userError } = await supabaseAdmin
          .from('users')
          .select('email, name')
          .eq('id', record.user_id)
          .single()

        // Fetch project details
        const { data: project, error: projectError } = await supabaseAdmin
          .from('project_spaces')
          .select('name')
          .eq('id', record.project_id)
          .single()

        if (userError) console.error("Error fetching user for project member insert:", userError)
        if (projectError) console.error("Error fetching project for project member insert:", projectError)

        if (user?.email && project?.name) {
          email = user.email
          recipientName = user.name || "Spacer Team Member"
          subject = `📂 Added to Project: ${project.name}`
          htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
              <h2 style="color: #1a202c; margin-top: 0;">Welcome aboard ${escapeHtml(recipientName)}!</h2>
              <p style="font-size: 16px; color: #4a5568; line-height: 1.5;">
                You have been added to the project space: <strong style="color: #2b6cb0;">${escapeHtml(project.name)}</strong>.
              </p>
              <p style="font-size: 14px; color: #718096; margin-top: 24px;">
                You can now view files, access tasks, and coordinate with team members for this project in Spacer.
              </p>
            </div>
          `
        }
      }
    }

    // --- Dispatch Email via Resend API ---
    if (email && subject && htmlContent) {
      if (!RESEND_API_KEY) {
        return new Response(JSON.stringify({ 
          error: "RESEND_API_KEY environment variable is not set." 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [email],
          subject: subject,
          html: htmlContent,
        }),
      })

      const resData = await res.json()

      if (!res.ok) {
        console.error("Resend API error:", resData)
        return new Response(JSON.stringify({ success: false, error: resData }), {
          status: res.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, info: resData }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, message: "No email required for this event payload." }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: any) {
    console.error("Edge function internal error:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
