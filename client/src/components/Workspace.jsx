import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Editor } from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import { API_BASE } from '../config/api';
import AuthModal from './AuthModal';

const DEFAULT_LANG = 'javascript';
//add
export default function Workspace({ problem, layoutSignal }) {
  const [language, setLanguage] = useState(DEFAULT_LANG);
  const [codeCache, setCodeCache] = useState({});
  const [descriptionWidth, setDescriptionWidth] = useState(50);

  // AUTH
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // AI
  const [aiHint, setAiHint] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // OUTPUT
  const [executionResult, setExecutionResult] = useState(null);
  const [outputHeight, setOutputHeight] = useState(190);
  const [isOutputCollapsed, setIsOutputCollapsed] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState("output");
  const [runStatus, setRunStatus] = useState(null);

  const containerRef = useRef(null);
  const editorRef = useRef(null);

  const languages = useMemo(() => {
    if (!problem || !problem.code_snippets) return [];
    return Object.keys(problem.code_snippets);
  }, [problem]);

  useEffect(() => {
    const userId = localStorage.getItem('userId');
    if (userId) setIsLoggedIn(true);
  }, []);

  useEffect(() => {
    if (!problem?.code_snippets) return;

    const availableLangs = Object.keys(problem.code_snippets);
    const initialLang = availableLangs.includes(language)
      ? language
      : availableLangs[0];

    setLanguage(initialLang);

    const newCache = {};
    availableLangs.forEach(lang => {
      newCache[lang] = problem.code_snippets[lang];
    });

    setCodeCache(newCache);
    setAiHint('');
    setExecutionResult(null);
    setRunStatus(null);
  }, [problem]);

  const handleProtectedAction = (e) => {
    if (!isLoggedIn) {
      e?.preventDefault();
      e?.stopPropagation();
      setShowAuthModal(true);
    }
  };

  // SUBMIT
  const handleSubmit = async () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    setRunStatus("running");
    setExecutionResult({ loading: true });

    try {
      const response = await fetch(`${API_BASE}/api/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeCache[language],
          language,
          slug: problem.slug
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setRunStatus("success");
        setExecutionResult({
          success: true,
          output: data.output,
          cpuTime: data.cpuTime,
          memory: data.memory
        });
      } else {
        setRunStatus("error");
        setExecutionResult({ success: false, error: data.error });
      }
    } catch (err) {
      setRunStatus("error");
      setExecutionResult({
        success: false,
        error: "Could not connect to server."
      });
    }
  };

  const handleAskAI = async () => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }

    setIsAiLoading(true);
    setAiHint('');

    try {
      const response = await fetch(`${API_BASE}/api/ai-help`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problemTitle: problem.title,
          problemDescription: problem.description,
          userCode: codeCache[language] || '',
          language
        })
      });

      const data = await response.json();
      setAiHint(response.ok ? data.suggestion : "AI Mentor offline.");
    } catch {
      setAiHint("Failed to connect AI Mentor.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleLanguageChange = (e) => {
    if (!isLoggedIn) {
      setShowAuthModal(true);
      return;
    }
    setLanguage(e.target.value);
  };

  const handleCodeChange = (newCode) => {
    setCodeCache(prev => ({ ...prev, [language]: newCode ?? '' }));
  };

  // SIDE DIVIDER
  const handleInnerDividerMouseDown = (e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();

    const onMove = (ev) => {
      let next = ((ev.clientX - rect.left) / rect.width) * 100;
      next = Math.min(75, Math.max(25, next));
      setDescriptionWidth(next);
    };

    const stop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
  };

  // OUTPUT RESIZE
  const handleOutputResizeMouseDown = (e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = outputHeight;

    const onMove = (ev) => {
      let h = startHeight + (startY - ev.clientY);
      h = Math.max(120, Math.min(450, h));
      setOutputHeight(h);
    };

    const stop = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", stop);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", stop);
  };

  const handleEditorMount = (editor) => {
    editorRef.current = editor;
    setTimeout(() => editor.layout(), 0);
  };

  useEffect(() => {
    editorRef.current?.layout();
  }, [descriptionWidth, layoutSignal]);

  if (!problem?.description) {
    return <div className="flex-1 flex items-center justify-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="flex flex-col h-full">

      {/* HEADER */}
      <header className="flex justify-between px-4 py-3 border-b border-gray-800 bg-panel">
        <h2 className="text-white font-semibold">{problem.title}</h2>

        <div className="flex gap-3">
          <select value={language} onChange={handleLanguageChange}
            className="bg-background border border-gray-700 px-2 py-1 text-xs">
            {languages.map(l => <option key={l}>{l}</option>)}
          </select>

          <button onClick={handleAskAI}
            className="bg-purple-600 px-3 py-1 rounded text-sm">
            {isAiLoading ? "Thinking..." : "✨ Ask AI"}
          </button>

          <button onClick={handleSubmit}
            className="bg-green-600 px-4 py-1 rounded text-sm">
            Submit
          </button>
        </div>
      </header>

      <div ref={containerRef} className="flex flex-1 overflow-hidden">

            <ReactMarkdown className="prose prose-invert max-w-none">
              {problem.description}
            </ReactMarkdown>
            {/* {problem.examples && Array.isArray(problem.examples) && ( */}
            {problem.examples && Array.isArray(problem.examples) && (
              <div className="mt-8 space-y-6">
                <h3 className="text-white font-bold text-lg border-b border-gray-800 pb-2">Examples</h3>
                {problem.examples.map((example, index) => (
                  <div key={index} className="bg-gray-800/40 p-4 rounded-xl border border-gray-700 space-y-3">
                    <h4 className="text-blue-400 font-bold text-sm">Example {index + 1}:</h4>
                    <div className="font-mono text-sm space-y-2">
                      <div className="flex flex-col sm:flex-row gap-1">
                        <span className="text-gray-500 min-w-[60px]">Input:</span>
                        <span className="text-gray-200 bg-black/30 px-2 py-0.5 rounded">{example.input}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-1">
                        <span className="text-gray-500 min-w-[60px]">Output:</span>
                        <span className="text-gray-200 bg-black/30 px-2 py-0.5 rounded">{example.output}</span>
                      </div>
                      {example.explanation && (
                        <div className="mt-2 text-gray-400">
                          <span className="text-gray-500 font-semibold">Explanation: </span>
                          <p className="inline italic">{example.explanation}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="w-1 bg-gray-800 cursor-col-resize"
          onMouseDown={handleInnerDividerMouseDown} />

        {/* EDITOR SIDE */}
        <section style={{ width: `${100 - descriptionWidth}%` }} className="flex flex-col">

          <div className="flex-1 border-b border-gray-800 relative">
            {!isLoggedIn && <div onClick={handleProtectedAction} className="absolute inset-0 z-20" />}
            <Editor
              height="100%"
              language={language}
              theme="vs-dark"
              value={codeCache[language] || ""}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              options={{ minimap: { enabled: false } }}
            />
          </div>

          {/* ULTRA PRO TERMINAL */}
          <div
            className="bg-[#0d1117] flex flex-col"
            style={{ height: isOutputCollapsed ? "42px" : `${outputHeight}px` }}
          >
            <div onMouseDown={handleOutputResizeMouseDown}
              className="h-1 cursor-ns-resize bg-gray-800 hover:bg-blue-500" />

            <div className="flex justify-between px-4 py-2 bg-gray-900 text-xs">

              <div className="flex gap-4">
                {["output","testcase","console"].map(tab => (
                  <button key={tab}
                    onClick={() => setActiveTerminalTab(tab)}
                    className={activeTerminalTab===tab ? "text-blue-400" : "text-gray-500"}>
                    {tab}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                {runStatus==="running" && <span className="text-yellow-400">● Running</span>}
                {runStatus==="success" && <span className="text-green-400">● Accepted</span>}
                {runStatus==="error" && <span className="text-red-400">● Error</span>}

                <button onClick={()=>setIsOutputCollapsed(!isOutputCollapsed)}>Toggle</button>
              </div>
            </div>

            {!isOutputCollapsed && (
              <div className="flex-1 overflow-auto p-3 text-sm text-gray-200">
                {activeTerminalTab==="output" && (
                  !executionResult ? <p>Run code to see output...</p> :
                  executionResult.loading ? <p className="text-yellow-400">Running...</p> :
                  executionResult.success ? <pre>{executionResult.output}</pre> :
                  <pre className="text-red-400">{executionResult.error}</pre>
                )}
              </div>
            )}
          </div>

        </section>
      </div>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  );
}