import { createClient } from '@/lib/supabase-request';
import { redirect } from 'next/navigation';

export default async function QueuePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: applications } = await supabase
    .from('applications')
    .select('id, status, created_at, jobs ( title, company, url )')
    .eq('user_id', user.id)
    .eq('status', 'queued')
    .order('created_at', { ascending: false });

  return (
    <main className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Application Queue</h1>

      {!applications || applications.length === 0 ? (
        <p className="text-muted-foreground">No applications in the queue.</p>
      ) : (
        <ul className="space-y-4">
          {applications.map((app) => {
            const job = Array.isArray(app.jobs) ? app.jobs[0] : app.jobs as any;
            return (
              <li key={app.id} className="border rounded-lg p-4">
                <p className="font-semibold">{job?.title ?? 'Unknown title'}</p>
                <p className="text-sm text-muted-foreground">{job?.company ?? ''}</p>
                {job?.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 underline mt-1 inline-block"
                  >
                    View listing
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
