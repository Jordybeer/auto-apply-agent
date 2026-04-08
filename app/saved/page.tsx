import { redirect } from 'next/navigation';

// /saved is fully replaced by /queue?tab=saved
// This redirect ensures any saved links / bottom-nav items still work.
export default function SavedPage() {
  redirect('/queue?tab=saved');
}
