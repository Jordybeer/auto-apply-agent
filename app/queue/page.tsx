"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import ApplicationCard from '@/components/ApplicationCard';
import Link from 'next/link';

export default function QueuePage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    // Crucial: The foreign key join syntax must exactly match the table name
    const { data, error } = await supabase
      .from('applications')
      .select(`
        id,
        match_score,
        cover_letter_draft,
        resume_bullets_draft,
        status,
        jobs (
          title,
          company,
          url,
          description
        )
      `)
      .eq('status', 'draft')
      .order('match_score', { ascending: false });
    
    if (error) {
      console.error("Error fetching queue:", error);
    }
    
    if (data) {
      // Clean up the data structure if Supabase returned jobs as an array
      const cleanedData = data.map(app => ({
        ...app,
        jobs: Array.isArray(app.jobs) ? app.jobs[0] : app.jobs
      }));
      setApplications(cleanedData);
    }
    setLoading(false);
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    await supabase.from('applications').update({ status: newStatus }).eq('id', id);
    setApplications(applications.filter(app => app.id !== id));
  };

  if (loading) return <div className="p-8 max-w-4xl mx-auto text-zinc-400">Loading your review queue...</div>;

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Review Queue</h1>
          <p className="text-zinc-400 mt-1">Review, edit, and approve your tailored applications.</p>
        </div>
        <Link href="/" className="text-sm text-zinc-400 hover:text-white border border-zinc-800 px-4 py-2 rounded">
          ← Back Home
        </Link>
      </div>
      
      {applications.length === 0 ? (
        <div className="border border-zinc-800 p-8 rounded-lg text-center bg-zinc-900/30">
          <h3 className="text-xl font-semibold mb-2">No pending drafts</h3>
          <p className="text-zinc-400">You are all caught up! Run the pipeline to scrape and draft new applications.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {applications.map((app) => (
            <ApplicationCard key={app.id} application={app} onAction={handleUpdateStatus} />
          ))}
        </div>
      )}
    </div>
  );
}