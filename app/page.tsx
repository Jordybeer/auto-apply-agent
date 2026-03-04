"use client";

import Link from 'next/link';
import { useState } from 'react';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');

  const runPipeline = async () => {
    setLoading(true);
    setStatus('Scraping new jobs...');
    
    try {
      // 1. Trigger the Scraper
      const scrapeRes = await fetch('/api/scrape', { method: 'POST' });
      const scrapeData = await scrapeRes.json();
      
      if (!scrapeData.success) throw new Error(scrapeData.error || "Scraping failed");
      setStatus(`Scraped ${scrapeData.count || 0} jobs. Processing with AI...`);

      if (scrapeData.count === 0) {
        setStatus(`Pipeline finished. No new jobs found to process.`);
        setLoading(false);
        return;
      }

      // 2. Trigger the LLM Evaluation
      const processRes = await fetch('/api/process', { method: 'POST' });
      const processData = await processRes.json();

      if (!processData.success && processData.message) {
         // Handle soft exits like "No jobs to process"
         setStatus(`Processing finished: ${processData.message}`);
      } else if (!processData.success) {
         throw new Error(processData.error || "AI Processing failed");
      } else {
         setStatus(`Drafted ${processData.count || 0} new applications. Queue ready!`);
      }

    } catch (error: any) {
      setStatus(`Error: ${error.message}`);
    }
    setLoading(false);
  };

  return (
    <main className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Job Application Agent 🤖</h1>
      <p className="text-zinc-400 mb-8">
        Your automated assistant that scrapes tech jobs, scores your match fit, and pre-drafts highly tailored cover letters.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-zinc-800 p-6 rounded-lg bg-zinc-900/50 flex flex-col items-start">
          <h2 className="text-xl font-semibold mb-2">Pipeline Engine</h2>
          <p className="text-zinc-400 mb-4 text-sm flex-grow">
            Trigger a manual scrape of job boards, followed by the LLM drafting sequence. Note: Currently injects mock data for testing.
          </p>
          <button 
            onClick={runPipeline}
            disabled={loading}
            className="bg-zinc-800 text-white px-4 py-2 rounded font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            {loading ? 'Pipeline Running...' : 'Run Scraper & LLM'}
          </button>
          {status && <p className="mt-4 text-sm text-zinc-300 font-mono">{status}</p>}
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