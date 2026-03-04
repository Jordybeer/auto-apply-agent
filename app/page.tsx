"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Platform = 'jobat' | 'stepstone' | 'ictjob';

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);

  const [platforms, setPlatforms] = useState<Record<Platform, boolean>>({
    jobat: true,
    stepstone: true,
    ictjob: true
  });

  const selectedPlatforms = useMemo(
    () => (Object.keys(platforms) as Platform[]).filter((p) => platforms[p]),
    [platforms]
  );

  const runPipeline = async () => {
    if (selectedPlatforms.length === 0) {
      setStatus('Error: Select at least one platform.');
      return;
    }

    setLoading(true);
    setProgress(5);
    setStatus('Initializing scrape run...');

    try {
      let totalScraped = 0;

      // Scrape platforms sequentially to avoid ScraperAPI concurrency limits.
      for (let i = 0; i < selectedPlatforms.length; i++) {
        const platform = selectedPlatforms[i];
        const pct = 10 + Math.round(((i + 1) / selectedPlatforms.length) * 40);

        setProgress(pct);
        setStatus(`Scraping ${platform}...`);

        const scrapeRes = await fetch(`/api/scrape?source=${platform}`, { method: 'POST' });

        if (!scrapeRes.ok) {
          const errText = await scrapeRes.text();
          throw new Error(
            `Server returned ${scrapeRes.status} while scraping ${platform}. (${errText.substring(0, 40)}...)`
          );
        }

        const scrapeData = await scrapeRes.json();
        if (!scrapeData.success) throw new Error(scrapeData.error || `Scraping failed for ${platform}`);

        totalScraped += scrapeData.count || 0;
      }

      setProgress(60);
      setStatus(`Scraped ${totalScraped} jobs. Comparing against your Dutch profile...`);

      if (totalScraped === 0) {
        setProgress(100);
        setStatus('Pipeline finished. No new jobs found to process.');
        setLoading(false);
        return;
      }

      setProgress(80);
      setStatus('AI drafting personalized motivation letters & CV bullets...');

      const processRes = await fetch('/api/process', { method: 'POST' });

      if (!processRes.ok) {
        const errText = await processRes.text();
        throw new Error(`AI Processing failed with status ${processRes.status}. (${errText.substring(0, 40)}...)`);
      }

      const processData = await processRes.json();

      setProgress(100);

      if (!processData.success && processData.message) {
        setStatus(`Processing finished: ${processData.message}`);
      } else if (!processData.success) {
        throw new Error(processData.error || 'AI Processing failed');
      } else {
        setStatus(`Drafted ${processData.count || 0} new applications. Queue ready!`);
      }
    } catch (error: any) {
      setProgress(0);
      setStatus(`Error: ${error.message}`);
    }

    setLoading(false);
  };

  const togglePlatform = (p: Platform) => {
    setPlatforms((prev) => ({ ...prev, [p]: !prev[p] }));
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
            Select job boards to scrape, then run the LLM drafting sequence.
          </p>

          <div className="w-full border border-zinc-800 rounded p-3 bg-black/20 mb-4 text-sm">
            <div className="text-zinc-300 font-medium mb-2">Platforms</div>
            <label className="flex items-center gap-2 text-zinc-300 mb-1">
              <input type="checkbox" checked={platforms.jobat} onChange={() => togglePlatform('jobat')} />
              Jobat
            </label>
            <label className="flex items-center gap-2 text-zinc-300 mb-1">
              <input type="checkbox" checked={platforms.stepstone} onChange={() => togglePlatform('stepstone')} />
              StepStone
            </label>
            <label className="flex items-center gap-2 text-zinc-300">
              <input type="checkbox" checked={platforms.ictjob} onChange={() => togglePlatform('ictjob')} />
              ictjob
            </label>
          </div>

          <button
            onClick={runPipeline}
            disabled={loading}
            className="w-full bg-zinc-800 text-white px-4 py-3 rounded font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors disabled:opacity-50 mb-4"
          >
            {loading ? 'Pipeline Running...' : 'Run Scraper & LLM'}
          </button>

          {loading && (
            <div className="w-full bg-zinc-800 rounded-full h-2.5 mb-4 overflow-hidden">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}

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
