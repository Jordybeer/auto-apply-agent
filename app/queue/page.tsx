"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import ApplicationCard from '@/components/ApplicationCard';
import Link from 'next/link';

export default function QueuePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    const { data, error } = await supabase
      .from('applications')
      .select(`
        id,
        match_score,
        status,
        jobs (
          title,
          company,
          url,
          source,
          description
        )
      `)
      .eq('status', 'draft')
      .order('match_score', { ascending: false });

    if (error) {
      console.error('Error fetching queue:', error);
    }

    if (data) {
      const cleanedData = data.map((app: any) => ({
        ...app,
        jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs
      }));
      setApplications(cleanedData);
    }
    setLoading(false);
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    await supabase.from('applications').update({ status: newStatus }).eq('id', id);
    setApplications(applications.filter((app) => app.id !== id));
  };

  if (loading) return <div className="p-8 max-w-4xl mx-auto text-zinc-400">Loading your review queue...</div>;

  return (
    <div className="max-w-3xl mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Review Queue</h1>
          <p className="text-zinc-400 mt-1 text-sm">
            {applications.length} job{applications.length !== 1 ? 's' : ''} waiting · open listing, mark applied or skip.
          </p>
        </div>
        <Link
          href="/"
          className="text-sm text-zinc-400 hover:text-white border border-zinc-800 px-4 py-2 rounded-lg"
        >
          ← Back
        </Link>
      </div>

      {applications.length === 0 ? (
        <div className="border border-zinc-800 p-8 rounded-xl text-center bg-zinc-900/30">
          <h3 className="text-xl font-semibold mb-2">No pending jobs</h3>
          <p className="text-zinc-400 text-sm">Run the pipeline to scrape and queue new listings.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} onAction={handleUpdateStatus} />
          ))}
        </div>
      )}
    </div>
  );
}
