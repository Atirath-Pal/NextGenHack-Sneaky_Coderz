import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Editor } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { API_BASE } from '../config/api';

const DEFAULT_LANG = 'javascript';

export default function Workspace({ problem }) {
  const [language, setLanguage] = useState(DEFAULT_LANG);
  const [codeCache, setCodeCache] = useState({});
  const [descriptionWidth, setDescriptionWidth] = useState(50);

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
    if (!problem?.code_snippets) return;
    const initialLang = languages.includes(language) ? language : languages[0];
    setLanguage(initialLang);
    const newCache = {};
    languages.forEach(lang => { newCache[lang] = problem.code_snippets[lang]; });
    setCodeCache(newCache);
    setExecutionResult(null);
    
    // Reset AI states when problem changes
    setAiHint(''); 
    setUserPrompt(''); 
    setAiFlowStatus('none');
  }, [problem]);

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

  --- ACTIONS ---
  const handleSubmit = async () => {
    setRunStatus("running");
    setExecutionResult({ loading: true });
    setIsOutputCollapsed(false);
    try {
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeCache[language], language, slug: problem.slug }),
      });
      const data = await response.json();
      setRunStatus(response.ok ? "success" : "error");
      setExecutionResult(response.ok ? { success: true, ...data } : { success: false, error: data.error });
    } catch {
      setRunStatus("error");
      setExecutionResult({ success: false, error: "Connection failed." });
    }
  };
  // const handleSubmit = async () => {
  //   setRunStatus("running");
  //   setExecutionResult({ loading: true });
  //   setIsOutputCollapsed(false);

  //   try {
  //     // 1. Fetch all test cases for this problem from Supabase
  //     // This costs 0 credits.
  //     const { data: testCases, error: fetchError } = await supabase
  //       .from('test_cases')
  //       .select('*')
  //       .eq('problem_id', problem.id);

  //     if (fetchError) throw new Error(fetchError.message);

  //     // 2. Call your NEW Edge Function (The one you just deployed)
  //     // This costs only 1 credit for ALL test cases.
  //     const { data, error: invokeError } = await supabase.functions.invoke('run-tests', {
  //       body: {
  //         userCode: codeCache[language],
  //         testCases: testCases,
  //         language: language
  //       }
  //     });

  //     if (invokeError) throw new Error(invokeError.message);

  //     // 3. Update the UI with the batch results
  //     setRunStatus("success");
  //     setExecutionResult({
  //       success: true,
  //       results: data.results // This is the array from your index.ts loop
  //     });

  //   } catch (err) {
  //     setRunStatus("error");
  //     setExecutionResult({
  //       success: false,
  //       error: err.message || "Connection failed."
  //     });
  //   }
  // };

  // ✨ STANDARD AI ACTION: For guidance and hints
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

  // ✨ NEW: CODE QUALITY ANALYSIS ACTION
  const handleAnalyzeCode = async () => {
    setAiFlowStatus('loading');
    setAiHint('');
    
    // The secret prompt we send to Gemini to force a code review
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

  const initiateAIFlow = () => {
    if (aiFlowStatus === 'none' || aiFlowStatus === 'result') {
      setAiFlowStatus('asking');
    }
  };

  if (!problem) return <div className="flex-1 flex items-center justify-center text-gray-500 bg-[#1a1a1a]">Select a problem...</div>;

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a] text-white overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-gray-800 bg-[#1e1e1e]">
        <div>
          <h2 className="text-lg font-bold">{problem.title}</h2>
          <span className="text-[10px] text-green-400 uppercase">{problem.difficulty}</span>
        </div>
        <div className="flex items-center gap-3">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} className="bg-[#0d1117] border border-gray-700 rounded px-2 py-1 text-xs outline-none focus:border-blue-500">
            {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
          </select>
          {/* ✨ NEW ANALYZE BUTTON */}
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
        {/* Description & AI Mentor Section */}
        <section style={{ width: `${descriptionWidth}%` }} className="border-r border-gray-800 overflow-y-auto p-8 custom-scrollbar relative">
          
          {/* ✨ DYNAMIC AI MENTOR BOX */}
          {aiFlowStatus !== 'none' && (
            <div className="p-5 bg-indigo-900/10 border border-indigo-500/30 rounded-xl mb-8 shadow-inner transition-all duration-300">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-indigo-400 font-bold text-sm flex items-center gap-2">✨ Intelligent Assistant</h3>
                <button onClick={() => setAiFlowStatus('none')} className="text-indigo-400 hover:text-white font-bold text-lg leading-none">✕</button>
              </div>

              {/* STAGE 1: Asking */}
              {aiFlowStatus === 'asking' && (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <p className="text-sm text-gray-300">Do you want to add a specific prompt or question about your code?</p>
                  <div className="flex gap-3">
                    <button onClick={() => setAiFlowStatus('typing')} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold py-2.5 rounded-lg transition">Yes</button>
                    <button onClick={() => handleAskAI(false)} className="flex-1 bg-[#262626] hover:bg-gray-700 border border-gray-600 text-white text-xs font-bold py-2.5 rounded-lg transition">No, just guide me</button>
                  </div>
                </div>
              )}

              {/* STAGE 2: Typing */}
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

              {/* STAGE 3: Loading */}
              {aiFlowStatus === 'loading' && (
                <div className="flex flex-col items-center justify-center py-6 space-y-4 animate-in fade-in duration-300">
                  <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-indigo-400 font-semibold animate-pulse">Analyzing your code...</p>
                </div>
              )}

              {/* STAGE 4: Result */}
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

          {/* Problem Description */}
          <ReactMarkdown className="prose prose-invert whitespace-pre-wrap">{formattedDescription}</ReactMarkdown>
          
          {/* Examples */}
          {parsedExamples.map((ex, i) => (
            <div key={i} className="mt-6 bg-[#262626] p-4 rounded-xl border border-gray-800 font-mono text-sm">
              <div className="text-blue-400 text-xs mb-2 uppercase font-bold tracking-wider">Example {ex.example_num || i+1}</div>
              <div className="whitespace-pre-wrap text-gray-300">{ex.example_text}</div>
            </div>
          ))}
        </section>

        {/* Vertical Divider */}
        <div className="w-1 bg-gray-800 cursor-col-resize hover:bg-blue-500 transition-colors shrink-0" onMouseDown={handleInnerDividerMouseDown} />

        {/* Editor & Terminal */}
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
          </div>

          {/* Terminal */}
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
                <span className="text-gray-600">Testcase configuration coming soon.</span>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
