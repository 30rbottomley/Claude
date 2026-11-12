import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Standard CORS headers allowing requests from the web
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Parse the body containing chat history and system prompt from the frontend
    const { messages, system_prompt } = await req.json()

    // 3. Check which API keys are available in Supabase Secrets
    const groqKey = Deno.env.get('GROQ_API_KEY')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    if (groqKey) {
      // ROUTE 1: GROQ (Testing Mode)
      let groqMessages = messages;
      if (system_prompt) {
        groqMessages = [{ role: 'system', content: system_prompt }, ...messages];
      }

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant', // Supported fast Groq model
          messages: groqMessages
        })
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error.message)

      // Translate Groq's response to look exactly like Claude's
      const translatedResponse = { content: [{ text: data.choices[0].message.content }] }

      return new Response(JSON.stringify(translatedResponse), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

    } else if (anthropicKey) {
      // ROUTE 2: CLAUDE (Production Mode)
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: system_prompt || undefined,
          messages: messages
        })
      })

      const data = await response.json()
      if (data.error) throw new Error(data.error.message)

      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } })

    } else {
      throw new Error("No API keys found. Add GROQ_API_KEY or ANTHROPIC_API_KEY to Supabase Project Settings -> Edge Functions -> Secrets.")
    }

  } catch (error) {
    // Send a 200 status so the Supabase client shows the actual error in the chat
    return new Response(JSON.stringify({ error: error.message }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } })
  }
})
