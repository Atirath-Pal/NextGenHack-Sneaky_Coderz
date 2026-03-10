import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Editor } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { API_BASE } from '../config/api';
import { supabase } from '../supabaseClient'; 

const DEFAULT_LANG = 'javascript';

export default function Workspace({ problem }) {
  const [language, setLanguage] = useState(DEFAULT_LANG);
  const [codeCache, setCodeCache] = useState({});
  const [descriptionWidth, setDescriptionWidth] = useState(50);
  
  const [dbTestCases, setDbTestCases] = useState([]);

  // Terminal State
  const [outputHeight, setOutputHeight] = useState(200);
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState("output");

  // Execution & AI State
  const [aiHint, setAiHint] = useState('');
  const [userPrompt, setUserPrompt] = useState('');  
  const [aiFlowStatus, setAiFlowStatus] = useState('none');  
  const [executionResult, setExecutionResult] = useState(null);
  const [runStatus, setRunStatus] = useState(null);

  // ✨ NEW: PROACTIVE AI STATE
  const [showProactiveHelp, setShowProactiveHelp] = useState(false);
  const typingTimeoutRef = useRef(null);

  const containerRef = useRef(null);
  const editorRef = useRef(null);

  // --- DATA PARSING ---
  const formattedDescription = useMemo(() => {
    if (!problem?.description) return "";
    return problem.description.replace(/\\n/g, '\n');
  }, [problem]);

  const parsedExamples = useMemo(() => {
    if (!problem?.examples) return [];
    try {
      return Array.isArray(problem.examples) ? problem.examples : JSON.parse(problem.examples);
    } catch (e) { return []; }
  }, [problem]);

  const languages = useMemo(() => problem?.code_snippets ? Object.keys(problem.code_snippets) : [], [problem]);

  useEffect(() => {
    const fetchTestCases = async () => {
      if (!problem?.id) return;
      try {
        const { data, error } = await supabase
          .from('test_cases')
          .select('*')
          .eq('problem_id', problem.id);
        
        if (!error) setDbTestCases(data);
      } catch (err) {
        console.error("Network Error:", err);
      }
    };

    if (problem) fetchTestCases();
  }, [problem]);

  useEffect(() => {
    if (!problem?.code_snippets) return;
    const initialLang = languages.includes(language) ? language : languages[0];
    setLanguage(initialLang);
    const newCache = {};
    languages.forEach(lang => { newCache[lang] = problem.code_snippets[lang]; });
    setCodeCache(newCache);
    setExecutionResult(null);
    setAiHint(''); 
    setUserPrompt(''); 
    setAiFlowStatus('none');
    setShowProactiveHelp(false); // Reset popup on problem change
  }, [problem, languages, language]);

  // ✨ NEW: IDLE DETECTION TIMER
  useEffect(() => {
    // 1. Hide the popup immediately when they start typing
    setShowProactiveHelp(false);
    
    // 2. Clear the old timer
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    // 3. Start a new timer for 10 seconds (10000 ms)
    typingTimeoutRef.current = setTimeout(() => {
      // Only show popup if they actually have some code written
      if (codeCache[language] && codeCache[language].trim().length > 5) {
        setShowProactiveHelp(true);
      }
    }, 10000); 

    // Cleanup timer on unmount
    return () => clearTimeout(typingTimeoutRef.current);
  }, [codeCache, language]);

  // --- RESIZE HANDLERS ---
  const handleInnerDividerMouseDown = (e) => {
    e.preventDefault();
    const onMove = (ev) => {
      const rect = containerRef.current.getBoundingClientRect();
      let next = ((ev.clientX - rect.left) / rect.width) * 100;
      setDescriptionWidth(Math.min(75, Math.max(20, next)));
    };
    const stop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
  };

  const handleOutputResizeMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = outputHeight;
    const onMove = (ev) => {
      const delta = startY - ev.clientY; 
      const newHeight = Math.max(42, Math.min(600, startHeight + delta));
      setOutputHeight(newHeight);
      if (newHeight > 50) setIsOutputCollapsed(false);
    };
    const stop = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
  };

  // --- ✨ SCORE UPDATING LOGIC ---
  const incrementUserScore = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { count, error: countError } = await supabase
        .from('submissions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('problem_id', problem.id)
        .eq('status', 'Accepted');

      if (countError) throw countError;

      if (count === 1) {
        const { data: profileData, error: fetchError } = await supabase
          .from('profiles')
          .select('rank_score')
          .eq('id', user.id)
          .single();

        if (fetchError) return;

        const newScore = (profileData.rank_score || 0) + 1;
        
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ rank_score: newScore }) 
          .eq('id', user.id);
          
        if (updateError) console.error("Update failed:", updateError.message);
      }
    } catch (err) {
      console.error("Score increment logic error:", err);
    }
  };

  // --- ✨ NEW: SUBMISSION RECORDING LOGIC ---
  const recordSubmission = async (status, executionData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('submissions')
        .insert([{
          user_id: user.id,
          problem_id: problem.id,
          status: status, 
          code: codeCache[language],
          language: language,
          execution_time: executionData?.cpuTime || 0,
          memory_usage: executionData?.memory || 0
        }]);

      if (error) console.error("Failed to record submission:", error.message);
    } catch (err) {
      console.error("Submission error:", err);
    }
  };

  // --- ACTIONS ---
  const handleSubmit = async () => {
    setRunStatus("running");
    setExecutionResult({ loading: true });
    setIsOutputCollapsed(false);
    setActiveTerminalTab("testcase"); 

    try {
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeCache[language], language, slug: problem.slug }),
      });
      const data = await response.json();
      
      if (response.ok) {
        setRunStatus("success");
        setExecutionResult({ success: true, ...data });

        const cleanOut = (data.output || "").replace(/\s/g, '');
        let allPassed = false;

        if (dbTestCases.length > 0) {
          allPassed = dbTestCases.every(tc => {
            const expectedStr = typeof tc.expected_output === 'object' 
              ? JSON.stringify(tc.expected_output) 
              : String(tc.expected_output);
            return cleanOut.includes(expectedStr.replace(/\s/g, ''));
          });

          if (allPassed) {
            await incrementUserScore();
          }
        }

        await recordSubmission(allPassed ? "Accepted" : "Wrong Answer", data);

      } else {
        setRunStatus("error");
        setExecutionResult({ success: false, error: data.error });
        await recordSubmission("Runtime Error", null);
      }
    } catch {
      setRunStatus("error");
      setExecutionResult({ success: false, error: "Connection failed." });
    }
  };

  const handleAskAI = async (useCustomPrompt = false) => {
    setAiFlowStatus('loading');
    setAiHint('');
    const promptToSend = useCustomPrompt ? userPrompt : '';
    try {
      const response = await fetch(`${API_BASE}/api/ai-help`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          problemTitle: problem.title, 
          problemDescription: formattedDescription,
          examples: parsedExamples,
          userCode: codeCache[language], 
          language: language,
          userPrompt: promptToSend
        })
      });
      const data = await response.json();
      if (response.ok) {
        setAiHint(data.suggestion);
        setUserPrompt(''); 
        setAiFlowStatus('result');
      } else {
        setAiHint("Oops! The AI Mentor is currently offline.");
        setAiFlowStatus('result');
      }
    } catch { 
      setAiHint("Failed to connect to AI Mentor."); 
      setAiFlowStatus('result');
    }
  };

  const handleAnalyzeCode = async () => {
    setAiFlowStatus('loading');
    setAiHint('');
    const analysisPrompt = "Please act as a senior developer and review my current code. Do not solve the problem for me. Instead, provide a structured 'Code Quality Report' containing: 1. The estimated Time Complexity (Big O). 2. The estimated Space Complexity (Big O). 3. Two specific suggestions to make my code cleaner, more readable, or more efficient.";
    try {
      const response = await fetch(`${API_BASE}/api/ai-help`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          problemTitle: problem.title, 
          problemDescription: formattedDescription,
          examples: parsedExamples,
          userCode: codeCache[language], 
          language: language,
          userPrompt: analysisPrompt
        })
      });
      const data = await response.json();
      if (response.ok) {
        setAiHint(data.suggestion);
        setAiFlowStatus('result');
      } else {
        setAiHint("Failed to analyze code quality.");
        setAiFlowStatus('result');
      }
    } catch { 
      setAiHint("Connection failed during analysis."); 
      setAiFlowStatus('result');
    }
  };

  // ✨ NEW: PROACTIVE HELP ACTION (Triggered by the popup)
  const handleProactiveHelp = async () => {
    setShowProactiveHelp(false);
    setAiFlowStatus('loading');
    setAiHint('');

    const proactivePrompt = "I haven't typed anything in a while and I might be stuck. Act as a Step-by-Step Advisor. Look at my exact code and: 1. Give me a VERY SMALL snippet of code for the immediate next logical step. 2. Explain why. 3. Suggest what I should do after. DO NOT solve the whole problem.";

    try {
      const response = await fetch(`${API_BASE}/api/ai-help`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          problemTitle: problem.title, 
          problemDescription: formattedDescription,
          userCode: codeCache[language], 
          language: language,
          userPrompt: proactivePrompt 
        })
      });
      const data = await response.json();
      if (response.ok) {
        setAiHint(data.suggestion);
        setAiFlowStatus('result');
      }
    } catch {
      setAiHint("Failed to connect to AI Mentor.");
      setAiFlowStatus('result');
    }
  };

  const initiateAIFlow = () => {
    if (aiFlowStatus === 'none' || aiFlowStatus === 'result') {
      setAiFlowStatus('asking');
    }
  };

  if (!problem) return <div className="flex-1 flex items-center justify-center text-gray-500 bg-[#1a1a1a]">Select a problem...</div>;

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] text-white overflow-hidden">
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-[#1e1e1e]">
        <div>
          <h2 className="text-lg font-bold">{problem.title}</h2>
          <span className="text-[10px] text-green-400 uppercase">{problem.difficulty}</span>
        </div>
        <div className="flex items-center gap-3">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-500">
            {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
          </select>
          <button onClick={handleAnalyzeCode} className="bg-emerald-700 hover:bg-emerald-600 px-4 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-1">
            <span>📊</span> Analyze Code
          </button>
          <button onClick={initiateAIFlow} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-1">
            <span>✨</span> Ask AI
          </button>
          <button onClick={handleSubmit} className="bg-blue-600 hover:bg-blue-500 px-6 py-1.5 rounded-md text-sm font-bold transition">Run</button>
        </div>
      </header>

      <div ref={containerRef} className="flex flex-1 overflow-hidden">
        <section style={{ width: `${descriptionWidth}%` }} className="border-r border-gray-800 overflow-y-auto p-8 custom-scrollbar relative">
          {aiFlowStatus !== 'none' && (
            <div className="p-5 bg-indigo-900/10 border border-indigo-500/30 rounded-xl mb-8 shadow-inner transition-all duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2">✨ Intelligent Assistant</h3>
                <button onClick={() => setAiFlowStatus('none')} className="text-indigo-400 hover:text-white font-bold text-lg leading-none">✕</button>
              </div>

              {aiFlowStatus === 'asking' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <p className="text-sm text-gray-300">Do you want to add a specific prompt or question about your code?</p>
                  <div className="flex gap-3">
                    <button onClick={() => setAiFlowStatus('typing')} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-lg transition">Yes</button>
                    <button onClick={() => handleAskAI(false)} className="flex-1 bg-[#262626] hover:bg-gray-700 border border-gray-600 text-white text-xs font-bold py-2.5 rounded-lg transition">No, just guide me</button>
                  </div>
                </div>
              )}

              {aiFlowStatus === 'typing' && (
                <div className="space-y-3 animate-in fade-in duration-300">
                  <textarea 
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="Type your question here..."
                    className="w-full bg-[#0d1117] border border-indigo-500/20 rounded-lg p-3 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/60 min-h-[80px] custom-scrollbar resize-y"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button onClick={() => handleAskAI(true)} disabled={!userPrompt.trim()} className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-not-allowed text-white font-bold py-2 rounded-lg text-xs transition-all">Send Prompt</button>
                    <button onClick={() => setAiFlowStatus('asking')} className="px-4 bg-transparent border border-gray-600 hover:bg-gray-800 text-gray-300 font-bold py-2 rounded-lg text-xs transition-all">Back</button>
                  </div>
                </div>
              )}

              {aiFlowStatus === 'loading' && (
                <div className="flex flex-col items-center justify-center py-6 space-y-4 animate-in fade-in duration-300">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-indigo-400 font-semibold animate-pulse">Analyzing your code...</p>
                </div>
              )}

              {aiFlowStatus === 'result' && aiHint && (
                <div className="animate-in fade-in duration-500">
                  <div className="p-4 bg-[#0d1117] border border-indigo-500/20 rounded-lg text-sm text-gray-200 shadow-inner">
                    <ReactMarkdown className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-black/50 prose-pre:border prose-pre:border-gray-800 prose-a:text-indigo-400">
                      {aiHint}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          )}

          <ReactMarkdown className="prose prose-invert whitespace-pre-wrap">{formattedDescription}</ReactMarkdown>
          
          {parsedExamples.map((ex, i) => (
            <div key={i} className="mt-6 bg-[#262626] p-4 rounded-xl border border-gray-800 font-mono text-sm">
              <div className="text-blue-400 text-xs mb-2 uppercase font-bold tracking-wider">Example {ex.example_num || i+1}</div>
              <div className="whitespace-pre-wrap text-gray-300">{ex.example_text}</div>
            </div>
          ))}
        </section>

        <div className="w-1 bg-gray-800 cursor-col-resize hover:bg-blue-500 transition-colors shrink-0" onMouseDown={handleInnerDividerMouseDown} />

        <section style={{ width: `${100 - descriptionWidth}%` }} className="flex flex-col bg-[#0d1117]">
          <div className="flex-1 relative overflow-hidden">
            <Editor
              height="100%"
              language={language === 'python3' ? 'python' : language}
              theme="vs-dark"
              value={codeCache[language] || ""}
              onChange={(val) => setCodeCache(prev => ({ ...prev, [language]: val }))}
              options={{ minimap: { enabled: false }, fontSize: 14, padding: { top: 20 }, automaticLayout: true, scrollBeyondLastLine: false }}
            />

            {/* ✨ FLOATING PROACTIVE POPUP */}
            {showProactiveHelp && (
              <div className="absolute bottom-8 right-8 z-50 animate-bounce">
                <button 
                  onClick={handleProactiveHelp}
                  className="bg-indigo-600 border-2 border-indigo-400 text-white px-6 py-3 rounded-full shadow-2xl font-bold text-sm flex items-center gap-2 hover:bg-indigo-500 transition-all"
                >
                  <span className="text-xl">🤖</span> 
                  Looks like you're stuck. Need a hint?
                </button>
              </div>
            )}
          </div>

          <div 
            className="flex flex-col bg-[#090c10] border-t border-gray-800 relative transition-all duration-200 ease-out" 
            style={{ height: isOutputCollapsed ? '42px' : `${outputHeight}px` }}
          >
            <div className="absolute top-0 left-0 w-full h-1 cursor-ns-resize hover:bg-blue-500 z-10" onMouseDown={handleOutputResizeMouseDown} />

            <div className="flex justify-between items-center px-6 h-[41px] bg-[#161b22] shrink-0">
              <div className="flex gap-4">
                {["output", "testcase"].map(tab => (
                  <button key={tab} onClick={() => {setActiveTerminalTab(tab); setIsOutputCollapsed(false);}} 
                    className={`text-[10px] font-bold uppercase ${activeTerminalTab === tab ? "text-blue-500" : "text-gray-500 hover:text-gray-300"}`}>
                    {tab}
                  </button>
                ))}
              </div>
              <button onClick={() => setIsOutputCollapsed(!isOutputCollapsed)} className="text-gray-500 hover:text-white text-[10px] font-bold">
                {isOutputCollapsed ? "EXPAND" : "COLLAPSE"}
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6 font-mono text-sm custom-scrollbar">
              {activeTerminalTab === "output" ? (
                executionResult?.loading ? <div className="text-yellow-500 animate-pulse flex items-center gap-2"><div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div> Running code on server...</div> :
                executionResult?.success ? <pre className="text-green-400 whitespace-pre-wrap">{executionResult.output}</pre> :
                executionResult?.error ? <pre className="text-red-400 whitespace-pre-wrap">{executionResult.error}</pre> :
                <span className="text-gray-600 italic">Run your code to see output here.</span>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-gray-400 text-xs font-bold mb-2">DATABASE TEST CASES</h4>
                  
                  {executionResult?.loading && (
                     <div className="text-yellow-500 text-xs mb-4 animate-pulse">Evaluating test cases against your code...</div>
                  )}

                  {dbTestCases.length > 0 ? (
                    dbTestCases.map((tc, i) => {
                      const expectedStr = typeof tc.expected_output === 'object' ? JSON.stringify(tc.expected_output) : String(tc.expected_output);
                      
                      let isPass = null;
                      if (executionResult?.success) {
                        const outStr = executionResult.output || "";
                        const cleanOut = outStr.replace(/\s/g, '');
                        const cleanExp = expectedStr.replace(/\s/g, '');
                        isPass = cleanOut.includes(cleanExp);
                      } else if (executionResult?.error) {
                        isPass = false;
                      }

                      return (
                        <div key={i} className="bg-[#1e1e1e] p-4 rounded-md border border-gray-700 font-mono text-xs shadow-inner">
                          <div className="flex justify-between items-center mb-2">
                            <div className="text-blue-400 uppercase font-bold tracking-wider">Test Case {i+1}</div>
                            {executionResult && !executionResult.loading && (
                              <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isPass ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                {isPass ? '✅ Passed' : '❌ Failed'}
                              </div>
                            )}
                          </div>
                          <div className="text-gray-300 whitespace-pre-wrap"><span className="text-gray-500">Input:</span> {JSON.stringify(tc.input)}</div>
                          <div className="text-gray-300 whitespace-pre-wrap mt-1"><span className="text-gray-500">Expected:</span> {expectedStr}</div>
                          
                          {executionResult && !executionResult.loading && i === 0 && (
                            <div className={`whitespace-pre-wrap mt-3 pt-3 border-t border-gray-700 ${isPass ? 'text-green-400' : 'text-red-400'}`}>
                              <span className="text-gray-500">Actual Output:</span> {executionResult.output || "Error compiling code"}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <span className="text-gray-600 italic">No test cases found in database. Check your browser console (F12) to see why!</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
