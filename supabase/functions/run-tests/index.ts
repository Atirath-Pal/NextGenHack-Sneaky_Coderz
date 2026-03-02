import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  // This receives the code and the array of test cases from your frontend
  const { userCode, testCases } = await req.json()

  // This loop runs every test case for the price of 1 credit
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

  return new Response(
    JSON.stringify({ results }),
    { headers: { "Content-Type": "application/json" } }
  )
})