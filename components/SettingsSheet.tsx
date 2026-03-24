'use client';

import { useState } from 'react';
import { Settings } from 'lucide-react';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import SettingsMenu from '@/components/SettingsMenu';

export default function SettingsSheet() {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Instellingen">
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Instellingen</SheetTitle>
        </SheetHeader>
        <div className="p-6 pt-4">
          {open && <SettingsMenu />}
        </div>
      </SheetContent>
    </Sheet>
  );
}
