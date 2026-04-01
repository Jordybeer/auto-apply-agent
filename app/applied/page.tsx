import { redirect } from 'next/navigation';

// /applied is fully replaced by /queue?tab=applied
// This redirect ensures any saved links / bottom-nav items still work.
export default function AppliedPage() {
  redirect('/queue?tab=applied');
}
