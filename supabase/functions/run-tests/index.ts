import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 1. Define CORS headers to allow the browser to communicate with this function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 2. Handle the Preflight OPTIONS request sent by the browser
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // This receives the code and the array of test cases from your frontend
    const { userCode, testCases, language } = await req.json()

    // 3. This loop runs every test case
    const results = testCases.map((test: any) => {
      // Logic to execute userCode and get actualOutput would go here.
      // For now, we simulate the comparison.
      const actualOutput = "result_from_code_execution"; 

      return {
        test_case_id: test.id,
        passed: JSON.stringify(actualOutput) === JSON.stringify(test.expected_output),
        input: test.input,
        expected: test.expected_output,
        actual: actualOutput
      }
    })

    // 4. Return the results with the proper CORS headers
    return new Response(
      JSON.stringify({ results }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        },
        status: 200 
      }
    )

  } catch (error) {
    // Handle potential JSON parsing errors or other issues
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json" 
        }, 
        status: 400 
      }
    )
  }
})
