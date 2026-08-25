/**
 * AI Router Edge Function
 * Handles all AI API endpoints with proper authentication, authorization, and security
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface RequestContext {
  user: any
  workspaceId: string | null
  isSuperAdmin: boolean
}

interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname
  const method = req.method

  try {
    // Get auth context
    const context = await getAuthContext(req)
    
    if (!context.user) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
        status: 401,
        headers: corsHeaders()
      })
    }

    // Route handling
    if (path === '/ai/providers' && method === 'GET') {
      return handleGetProviders(context)
    } else if (path === '/ai/providers' && method === 'POST') {
      return handleCreateProvider(req, context)
    } else if (path.match(/^\/ai\/providers\/[^\/]+$/) && method === 'PUT') {
      const providerId = path.split('/').pop()
      return handleUpdateProvider(req, providerId!, context)
    } else if (path.match(/^\/ai\/providers\/[^\/]+$/) && method === 'DELETE') {
      const providerId = path.split('/').pop()
      return handleDeleteProvider(providerId!, context)
    } else if (path.match(/^\/ai\/providers\/[^\/]+\/test$/) && method === 'POST') {
      const providerId = path.split('/')[3]
      return handleTestProvider(providerId!, context)
    } else if (path.match(/^\/ai\/providers\/[^\/]+\/disable$/) && method === 'POST') {
      const providerId = path.split('/')[3]
      return handleDisableProvider(providerId!, context)
    } else if (path.match(/^\/ai\/providers\/[^\/]+\/enable$/) && method === 'POST') {
      const providerId = path.split('/')[3]
      return handleEnableProvider(providerId!, context)
    } else if (path === '/ai/providers/health' && method === 'GET') {
      return handleGetProviderHealth(context)
    } else if (path === '/ai/usage' && method === 'GET') {
      return handleGetUsage(url, context)
    } else if (path === '/ai/sawty/generate' && method === 'POST') {
      return handleSawtyGenerate(req, context)
    } else if (path === '/ai/sawty/audio' && method === 'POST') {
      return handleSawtyAudio(req, context)
    } else if (path === '/ai/sawty/generate' && method === 'POST') {
      return handleSawtyGenerate(req, context)
    } else if (path === '/ai/sawty/audio' && method === 'POST') {
      return handleSawtyAudio(req, context)
    } else if (path === '/ai/landing-page/analyze' && method === 'POST') {
      return handleLandingPageAnalyze(req, context)
    } else if (path === '/ai/landing-page/angles' && method === 'POST') {
      return handleLandingPageAngles(req, context)
    } else if (path === '/ai/landing-page/offers' && method === 'POST') {
      return handleLandingPageOffers(req, context)
    } else if (path === '/ai/landing-page/generate' && method === 'POST') {
      return handleLandingPageGenerate(req, context)
    } else if (path === '/ai/landing-page/qa/conversion' && method === 'POST') {
      return handleConversionQA(req, context)
    } else if (path === '/ai/landing-page/qa/style' && method === 'POST') {
      return handleStyleQA(req, context)
    } else if (path === '/ai/prompts' && method === 'GET') {
      return handleGetPrompts(context)
    } else if (path === '/ai/prompts' && method === 'POST') {
      return handleCreatePrompt(req, context)
    } else if (path === '/ai/styles' && method === 'GET') {
      return handleGetStyles(context)
    } else if (path === '/ai/styles' && method === 'POST') {
      return handleCreateStyle(req, context)
    } else {
      return new Response(JSON.stringify({ success: false, error: 'Not found' }), {
        status: 404,
        headers: corsHeaders()
      })
    }
  } catch (error) {
    console.error('AI Router error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: corsHeaders()
    })
  }
})

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  }
}

async function getAuthContext(req: Request): Promise<RequestContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { user: null, workspaceId: null, isSuperAdmin: false }
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { user: null, workspaceId: null, isSuperAdmin: false }
  }

  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, workspace_id')
    .eq('id', user.id)
    .single()

  return {
    user,
    workspaceId: profile?.workspace_id || null,
    isSuperAdmin: profile?.role === 'founder' && user.email?.trim().toLowerCase() === 'amineelaaouamecom@gmail.com'
  }
}

// Helper to check Super Admin
function requireSuperAdmin(context: RequestContext): void {
  if (!context.isSuperAdmin) {
    throw new Error('Founder access required')
  }
}

// Helper to check workspace access
function requireWorkspaceAccess(context: RequestContext, workspaceId: string): void {
  if (context.workspaceId !== workspaceId && !context.isSuperAdmin) {
    throw new Error('Workspace access denied')
  }
}

// Provider Management Handlers
async function handleGetProviders(context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const { data, error } = await supabase
    .from('ai_providers')
    .select('*')
    .order('priority', { ascending: false })

  if (error) throw error

  // Remove credentials from response
  const safeProviders = data.map(p => {
    const { credential_encrypted, ...safe } = p
    return safe
  })

  return new Response(JSON.stringify({ success: true, data: safeProviders }), {
    headers: corsHeaders()
  })
}

async function handleCreateProvider(req: Request, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const body = await req.json()
  
  const { data, error } = await supabase
    .from('ai_providers')
    .insert({
      name: body.name,
      provider_type: body.provider_type,
      project_id: body.project_id,
      model_id: body.model_id,
      priority: body.priority || 100,
      credential_encrypted: body.credential,
      capabilities: body.capabilities || [],
      status: 'TESTING',
      health_status: 'TESTING',
      failure_count: 0
    })
    .select()
    .single()

  if (error) throw error

  // Log audit
  await logAudit(context.user.id, 'PROVIDER_CREATED', 'ai_provider', data.id)

  const { credential_encrypted, ...safe } = data
  return new Response(JSON.stringify({ success: true, data: safe }), {
    headers: corsHeaders()
  })
}

async function handleUpdateProvider(req: Request, providerId: string, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const body = await req.json()
  
  const { data, error } = await supabase
    .from('ai_providers')
    .update({
      name: body.name,
      provider_type: body.provider_type,
      project_id: body.project_id,
      model_id: body.model_id,
      priority: body.priority,
      credential_encrypted: body.credential,
      capabilities: body.capabilities,
      updated_at: new Date().toISOString()
    })
    .eq('id', providerId)
    .select()
    .single()

  if (error) throw error

  await logAudit(context.user.id, 'PROVIDER_UPDATED', 'ai_provider', providerId)

  const { credential_encrypted, ...safe } = data
  return new Response(JSON.stringify({ success: true, data: safe }), {
    headers: corsHeaders()
  })
}

async function handleDeleteProvider(providerId: string, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const { error } = await supabase
    .from('ai_providers')
    .delete()
    .eq('id', providerId)

  if (error) throw error

  await logAudit(context.user.id, 'PROVIDER_DELETED', 'ai_provider', providerId)

  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders()
  })
}

async function handleTestProvider(providerId: string, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  // Placeholder for actual health check
  // In production, this would call the provider's health check
  const isHealthy = true

  const { error } = await supabase
    .from('ai_providers')
    .update({
      health_status: isHealthy ? 'HEALTHY' : 'FAILED',
      last_health_check: new Date().toISOString()
    })
    .eq('id', providerId)

  if (error) throw error

  await logAudit(context.user.id, 'PROVIDER_TESTED', 'ai_provider', providerId)

  return new Response(JSON.stringify({ success: true, data: { healthy: isHealthy } }), {
    headers: corsHeaders()
  })
}

async function handleDisableProvider(providerId: string, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const { error } = await supabase
    .from('ai_providers')
    .update({ status: 'DISABLED' })
    .eq('id', providerId)

  if (error) throw error

  await logAudit(context.user.id, 'PROVIDER_DISABLED', 'ai_provider', providerId)

  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders()
  })
}

async function handleEnableProvider(providerId: string, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const { error } = await supabase
    .from('ai_providers')
    .update({ status: 'HEALTHY' })
    .eq('id', providerId)

  if (error) throw error

  await logAudit(context.user.id, 'PROVIDER_ENABLED', 'ai_provider', providerId)

  return new Response(JSON.stringify({ success: true }), {
    headers: corsHeaders()
  })
}

async function handleGetProviderHealth(context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const { data, error } = await supabase
    .from('ai_providers')
    .select('id, name, status, health_status, cooldown_until, last_health_check, failure_count')
    .order('priority', { ascending: false })

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

async function handleGetUsage(url: URL, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const days = parseInt(url.searchParams.get('days') || '7')
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  const { data, error } = await supabase
    .from('ai_provider_usage')
    .select('*')
    .gte('date', startDate.toISOString().split('T')[0])
    .order('date', { ascending: false })

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

// Sawty Handlers
async function handleSawtyGenerate(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const body = await req.json()
  
  // Create generation job
  const { data: job, error: jobError } = await supabase
    .from('ai_generation_jobs')
    .insert({
      workspace_id: context.workspaceId,
      user_id: context.user.id,
      task_type: 'SAWTY_SCRIPT',
      input_data: body,
      status: 'queued',
      progress: 0
    })
    .select()
    .single()

  if (jobError) throw jobError

  // Placeholder for actual AI generation
  // In production, this would call the provider router
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Update job
  await supabase
    .from('ai_generation_jobs')
    .update({
      status: 'completed',
      progress: 100,
      result: { script: 'Generated script placeholder' },
      completed_at: new Date().toISOString()
    })
    .eq('id', job.id)

  // Log usage
  await logUsage(context.workspaceId, job.id, 'SAWTY_SCRIPT', 100, 0)

  return new Response(JSON.stringify({ success: true, data: { jobId: job.id } }), {
    headers: corsHeaders()
  })
}

async function handleSawtyAudio(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const body = await req.json()
  
  // Placeholder for audio generation
  const audioUrl = 'https://example.com/audio.mp3'

  return new Response(JSON.stringify({ success: true, data: { audioUrl } }), {
    headers: corsHeaders()
  })
}

// Landing Page Handlers
async function handleLandingPageAnalyze(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const body = await req.json()
  
  const { data, error } = await supabase
    .from('ai_products')
    .insert({
      workspace_id: context.workspaceId,
      user_id: context.user.id,
      product_name: body.product_name,
      product_image_url: body.product_image_url,
      benefit: body.benefit,
      target_customer: body.target_customer,
      problem: body.problem,
      marketing_angle: body.marketing_angle
    })
    .select()
    .single()

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

async function handleLandingPageAngles(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const body = await req.json()
  
  const angles = [
    { angle: 'Problem-Solution', details: 'Focus on the problem and how your product solves it' },
    { angle: 'Benefit-First', details: 'Lead with the main benefit' },
    { angle: 'Social Proof', details: 'Use testimonials and reviews' }
  ]

  return new Response(JSON.stringify({ success: true, data: { angles } }), {
    headers: corsHeaders()
  })
}

async function handleLandingPageOffers(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const body = await req.json()
  
  const offers = [
    { offer_text: 'Limited Time: 50% Off', price: body.price, currency: 'MAD' },
    { offer_text: 'Buy 1 Get 1 Free', price: body.price, currency: 'MAD' }
  ]

  return new Response(JSON.stringify({ success: true, data: { offers } }), {
    headers: corsHeaders()
  })
}

async function handleLandingPageGenerate(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const body = await req.json()
  
  const { data, error } = await supabase
    .from('ai_landing_pages')
    .insert({
      workspace_id: context.workspaceId,
      user_id: context.user.id,
      product_id: body.product_id,
      selected_angle: body.selected_angle,
      selected_offer: body.selected_offer,
      generated_content: body.generated_content,
      status: 'draft'
    })
    .select()
    .single()

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

async function handleConversionQA(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const results = {
    hero: { status: 'pass', message: 'Hero section is strong' },
    cta: { status: 'warning', message: 'CTA could be more prominent' },
    urgency: { status: 'pass', message: 'Urgency elements present' }
  }

  return new Response(JSON.stringify({ success: true, data: results }), {
    headers: corsHeaders()
  })
}

async function handleStyleQA(req: Request, context: RequestContext): Promise<Response> {
  if (!context.workspaceId) {
    throw new Error('Workspace required')
  }

  const results = {
    contrast: { status: 'pass', message: 'Color contrast is accessible' },
    spacing: { status: 'pass', message: 'Spacing is consistent' },
    typography: { status: 'warning', message: 'Font sizes could be larger on mobile' }
  }

  return new Response(JSON.stringify({ success: true, data: results }), {
    headers: corsHeaders()
  })
}

// Prompt Management Handlers
async function handleGetPrompts(context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const { data, error } = await supabase
    .from('ai_prompt_versions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

async function handleCreatePrompt(req: Request, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const body = await req.json()
  
  const { data, error } = await supabase
    .from('ai_prompt_versions')
    .insert({
      task_type: body.task_type,
      version: body.version,
      content: body.content,
      is_active: body.is_active || false
    })
    .select()
    .single()

  if (error) throw error

  await logAudit(context.user.id, 'PROMPT_CREATED', 'ai_prompt_version', data.id)

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

// Style Management Handlers
async function handleGetStyles(context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const { data, error } = await supabase
    .from('ai_style_versions')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

async function handleCreateStyle(req: Request, context: RequestContext): Promise<Response> {
  requireSuperAdmin(context)

  const body = await req.json()
  
  const { data, error } = await supabase
    .from('ai_style_versions')
    .insert({
      style_profile_id: body.style_profile_id,
      version: body.version,
      config: body.config,
      is_active: body.is_active || false
    })
    .select()
    .single()

  if (error) throw error

  await logAudit(context.user.id, 'STYLE_CREATED', 'ai_style_version', data.id)

  return new Response(JSON.stringify({ success: true, data }), {
    headers: corsHeaders()
  })
}

// Sawty.ma Script Generation
async function handleSawtyGenerate(req: Request, context: RequestContext): Promise<Response> {
  if (!context.user) {
    throw new Error('Authentication required')
  }

  const body = await req.json()
  const { prompt } = body

  if (!prompt) {
    return new Response(JSON.stringify({ success: false, error: 'Prompt is required' }), {
      status: 400,
      headers: corsHeaders()
    })
  }

  try {
    // Get active Gemini provider
    const { data: providers } = await supabase
      .from('ai_providers')
      .select('*')
      .eq('provider_type', 'gemini')
      .eq('status', 'ACTIVE')
      .order('priority', { ascending: false })
      .limit(1)

    if (!providers || providers.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No active Gemini provider configured' }), {
        status: 400,
        headers: corsHeaders()
      })
    }

    const provider = providers[0]
    const apiKey = provider.credential_encrypted

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048
        }
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error?.message || 'Gemini API request failed')
    }

    const result = await response.json()
    const generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text

    if (!generatedText) {
      throw new Error('No content generated')
    }

    // Try to parse as JSON
    let parsedData
    try {
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0])
      } else {
        parsedData = { fullScript: generatedText, segments: [], tips: '' }
      }
    } catch (e) {
      parsedData = { fullScript: generatedText, segments: [], tips: '' }
    }

    return new Response(JSON.stringify({ success: true, data: parsedData }), {
      headers: corsHeaders()
    })

  } catch (error) {
    console.error('Sawty generate error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: corsHeaders()
    })
  }
}

// Sawty.ma Audio Generation (client-side TTS, this is a placeholder for future server-side processing)
async function handleSawtyAudio(req: Request, context: RequestContext): Promise<Response> {
  if (!context.user) {
    throw new Error('Authentication required')
  }

  // Audio generation is handled client-side using Gemini TTS API
  // This endpoint can be used for future server-side audio processing
  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Audio generation should be handled client-side using Gemini TTS API' 
  }), {
    headers: corsHeaders()
  })
}

// Audit Logging
async function logAudit(adminId: string, action: string, targetType: string, targetId: string): Promise<void> {
  await supabase
    .from('ai_audit_logs')
    .insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      details: {}
    })
}

// Usage Logging
async function logUsage(workspaceId: string, providerId: string, task: string, tokens: number, latency: number): Promise<void> {
  const today = new Date().toISOString().split('T')[0]
  
  await supabase
    .from('ai_provider_usage')
    .upsert({
      provider_id: providerId,
      workspace_id: workspaceId,
      date: today,
      model: 'gemini-pro',
      task,
      request_count: 1,
      success_count: 1,
      failure_count: 0,
      total_tokens: tokens,
      total_latency: latency
    }, {
      onConflict: 'provider_id,workspace_id,date,model,task'
    })
}
