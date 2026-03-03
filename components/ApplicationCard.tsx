"use client";

import { useState } from 'react';

export default function ApplicationCard({ application, onAction }: { application: any, onAction: (id: string, status: string) => void }) {
  const { jobs, match_score, cover_letter_draft, resume_bullets_draft, id } = application;
  const [isEditing, setIsEditing] = useState(false);
  const [coverLetter, setCoverLetter] = useState(cover_letter_draft);

  const scoreColor = match_score >= 80 ? 'text-green-500' : match_score >= 60 ? 'text-yellow-500' : 'text-red-500';

  return (
    <div className="border border-zinc-800 rounded-lg p-6 bg-zinc-900/30">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h2 className="text-2xl font-bold">{jobs?.title || 'Unknown Title'}</h2>
          <p className="text-xl text-zinc-400">{jobs?.company || 'Unknown Company'}</p>
          {jobs?.url && (
            <a href={jobs.url} target="_blank" rel="noreferrer" className="text-blue-400 text-sm hover:underline">
              View Original Posting
            </a>
          )}
        </div>
        <div className={`text-3xl font-bold ${scoreColor}`}>
          {match_score}% Match
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <div>
          <h3 className="font-semibold text-lg mb-2 text-zinc-300">Tailored Resume Bullets</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm text-zinc-300 mb-6">
            {resume_bullets_draft?.map((bullet: string, i: number) => (
              <li key={i}>{bullet}</li>
            ))}
          </ul>

          <h3 className="font-semibold text-lg mb-2 text-zinc-300">Job Description Snippet</h3>
          <p className="text-sm text-zinc-500 max-h-32 overflow-y-auto pr-2 bg-black/50 p-3 rounded border border-zinc-800">
            {jobs?.description}
          </p>
        </div>

        <div className="flex flex-col">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-lg text-zinc-300">Drafted Cover Letter</h3>
            <button onClick={() => setIsEditing(!isEditing)} className="text-sm text-zinc-400 hover:text-white transition-colors">
              {isEditing ? 'Save' : 'Edit text'}
            </button>
          </div>
          
          {isEditing ? (
            <textarea 
              className="w-full h-64 bg-zinc-950 border border-zinc-700 p-3 text-sm rounded focus:outline-none focus:border-zinc-500"
              value={coverLetter}
              onChange={(e) => setCoverLetter(e.target.value)}
            />
          ) : (
            <div className="bg-zinc-950 border border-zinc-800 p-4 rounded text-sm whitespace-pre-wrap flex-grow">
              {coverLetter}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4 mt-8 pt-4 border-t border-zinc-800">
        <button 
          onClick={() => onAction(id, 'sent')} 
          className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded font-medium transition-colors"
        >
          Approve & Mark Sent
        </button>
        <button 
          onClick={() => onAction(id, 'skipped')} 
          className="bg-zinc-800 hover:bg-red-900/50 text-zinc-300 hover:text-red-200 px-6 py-2 rounded font-medium transition-colors"
        >
          Skip / Reject
        </button>
      </div>
    </div>
  );
}