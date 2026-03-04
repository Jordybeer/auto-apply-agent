"use client";

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);

  const runPipeline = async () => {
    setLoading(true);
    setProgress(10);
    setStatus('Initializing ScraperAPI Proxy (Bypassing Bot Protection)...');
    
    try {
      // 1. Trigger the Scraper
      const scrapeRes = await fetch('/api/scrape', { method: 'POST' });
      setProgress(40);
      setStatus('Parsing job boards for Antwerp roles...');
      
      const scrapeData = await scrapeRes.json();
      
      if (!scrapeData.success) throw new Error(scrapeData.error || "Scraping failed");
      
      setProgress(60);
      setStatus(`Scraped ${scrapeData.count || 0} jobs. Comparing against your Dutch profile...`);

      if (scrapeData.count === 0) {
        setProgress(100);
        setStatus(`Pipeline finished. ${scrapeData.message || "No new jobs found to process."}`);
        setLoading(false);
        return;
      }

      // 2. Trigger the LLM Evaluation
      setProgress(80);
      setStatus('AI drafting personalized motivation letters & CV bullets...');
      
      const processRes = await fetch('/api/process', { method: 'POST' });
      const processData = await processRes.json();

      setProgress(100);
      
      if (!processData.success && processData.message) {
         setStatus(`Processing finished: ${processData.message}`);
      } else if (!processData.success) {
         throw new Error(processData.error || "AI Processing failed");
      } else {
         setStatus(`Drafted ${processData.count || 0} new applications. Queue ready!`);
      }

    } catch (error: any) {
      setProgress(0);
      setStatus(`Error: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Job Application Agent 🤖</h1>
      <p className="text-zinc-400 mb-8">
        Your automated assistant that scrapes tech jobs in Antwerp, scores your match fit, and pre-drafts highly tailored cover letters.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-zinc-800 p-6 rounded-lg bg-zinc-900/50 flex flex-col items-start w-full overflow-hidden">
          <h2 className="text-xl font-semibold mb-2">Pipeline Engine</h2>
          <p className="text-zinc-400 mb-4 text-sm">
            Trigger a manual scrape of Jobat and StepStone, followed by the LLM drafting sequence.
          </p>
          
          <button 
            onClick={runPipeline}
            disabled={loading}
            className="w-full bg-zinc-800 text-white px-4 py-3 rounded font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50 mb-4"
          >
            {loading ? 'Pipeline Running...' : 'Run Scraper & LLM'}
          </button>
          
          {/* Progress Bar UI */}
          {loading && (
            <div className="w-full bg-zinc-800 rounded-full h-2.5 mb-4 overflow-hidden">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
          
          {/* Status Text Box */}
          {status && (
            <div className="w-full bg-black/40 border border-zinc-800 rounded p-3 text-sm text-zinc-300 font-mono break-words">
              &gt; {status}
            </div>
          )}
        </div>

        <div className="border border-zinc-800 p-6 rounded-lg bg-zinc-900/50 flex flex-col items-start">
          <h2 className="text-xl font-semibold mb-2">Review Queue</h2>
          <p className="text-zinc-400 mb-4 text-sm flex-grow">
            Check pre-drafted cover letters and tailored resumes for high-match jobs. Approve, edit, or skip them.
          </p>
          <Link href="/queue" className="bg-zinc-100 text-black px-4 py-2 rounded font-medium inline-block hover:bg-white transition-colors">
            Open Queue
          </Link>
        </div>
      </div>
    </main>
  );
}