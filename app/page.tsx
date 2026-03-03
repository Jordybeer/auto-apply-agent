import Link from 'next/link';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Job Application Agent 🤖</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-zinc-800 p-6 rounded-lg bg-zinc-900/50">
          <h2 className="text-xl font-semibold mb-2">Review Queue</h2>
          <p className="text-zinc-400 mb-4">Check pre-drafted cover letters and tailored resumes for high-match jobs.</p>
          <Link href="/queue" className="bg-zinc-100 text-black px-4 py-2 rounded font-medium inline-block hover:bg-white transition-colors">
            Open Queue
          </Link>
        </div>

        <div className="border border-zinc-800 p-6 rounded-lg bg-zinc-900/50">
          <h2 className="text-xl font-semibold mb-2">Manual Scrape</h2>
          <p className="text-zinc-400 mb-4">Trigger a manual scrape of VDAB and Jobat right now.</p>
          <button className="bg-zinc-800 text-white px-4 py-2 rounded font-medium border border-zinc-700 hover:bg-zinc-700 transition-colors">
            Run Scraper
          </button>
        </div>
      </div>
    </main>
  );
}